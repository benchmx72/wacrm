import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { userHasPermission } from "@/lib/auth/server-permissions";
import { getServerAccountOwnerId } from "@/lib/auth/account";

const DEFAULT_STAGES = [
  { name: "New Lead", color: "#3b82f6", position: 0 },
  { name: "Qualified", color: "#eab308", position: 1 },
  { name: "Proposal Sent", color: "#f97316", position: 2 },
  { name: "Negotiation", color: "#8b5cf6", position: 3 },
  { name: "Won", color: "#22c55e", position: 4 },
];

type LeadProfile = {
  name?: string;
  service?: string;
  need?: string;
  urgency?: string;
  budget?: string;
  stage?: string;
  nextAction?: string;
  businessContext?: string;
};

function cleanLeadProfile(value: unknown): LeadProfile {
  if (!value || typeof value !== "object") return {};
  const input = value as Record<string, unknown>;
  const clean = (key: keyof LeadProfile) =>
    typeof input[key] === "string" ? input[key].trim().slice(0, 500) : "";

  return {
    name: clean("name"),
    service: clean("service"),
    need: clean("need"),
    urgency: clean("urgency"),
    budget: clean("budget"),
    stage: clean("stage"),
    nextAction: clean("nextAction"),
    businessContext: clean("businessContext"),
  };
}

function demoPhoneFor(service?: string) {
  const normalized = service?.toLowerCase() ?? "";
  if (normalized.includes("medic") || normalized.includes("clinic")) {
    return "+1555001001";
  }
  if (normalized.includes("abogado") || normalized.includes("legal")) {
    return "+1555002002";
  }
  return "+1555003003";
}

async function getOrCreatePipeline(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
) {
  const { data: existing, error: existingError } = await supabase
    .from("pipelines")
    .select("*")
    .eq("user_id", userId)
    .order("created_at")
    .limit(1)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing) return existing;

  const { data: pipeline, error: pipelineError } = await supabase
    .from("pipelines")
    .insert({ user_id: userId, name: "Sales Pipeline" })
    .select()
    .single();

  if (pipelineError || !pipeline) throw pipelineError;

  const stageRows = DEFAULT_STAGES.map((stage) => ({
    pipeline_id: pipeline.id,
    ...stage,
  }));
  const { error: stagesError } = await supabase
    .from("pipeline_stages")
    .insert(stageRows);

  if (stagesError) throw stagesError;

  return pipeline;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await userHasPermission(supabase, user.id, "use_demo_tools"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const accountOwnerId = await getServerAccountOwnerId(supabase, user.id);

  const body = await request.json().catch(() => null);
  const lead = cleanLeadProfile(body?.lead_profile);

  const pipeline = await getOrCreatePipeline(supabase, accountOwnerId);
  const { data: firstStage, error: stageError } = await supabase
    .from("pipeline_stages")
    .select("*")
    .eq("pipeline_id", pipeline.id)
    .order("position")
    .limit(1)
    .maybeSingle();

  if (stageError || !firstStage) {
    return NextResponse.json(
      { error: stageError?.message ?? "Pipeline stage not found" },
      { status: 500 },
    );
  }

  const phone = demoPhoneFor(lead.service);
  const { data: existingContact } = await supabase
    .from("contacts")
    .select("*")
    .eq("user_id", accountOwnerId)
    .eq("phone", phone)
    .maybeSingle();

  const contactPayload = {
    user_id: accountOwnerId,
    phone,
    name: lead.name || "Lead demo",
    company: lead.service || "Demo",
  };

  const contact = existingContact
    ? (
        await supabase
          .from("contacts")
          .update(contactPayload)
          .eq("id", existingContact.id)
          .select()
          .single()
      ).data
    : (
        await supabase
          .from("contacts")
          .insert(contactPayload)
          .select()
          .single()
      ).data;

  if (!contact) {
    return NextResponse.json(
      { error: "Failed to create demo contact" },
      { status: 500 },
    );
  }

  const notes = [
    lead.need ? `Necesidad: ${lead.need}` : "",
    lead.urgency ? `Urgencia: ${lead.urgency}` : "",
    lead.budget ? `Presupuesto: ${lead.budget}` : "",
    lead.stage ? `Etapa demo: ${lead.stage}` : "",
    lead.nextAction ? `Proxima accion: ${lead.nextAction}` : "",
    lead.businessContext ? `Contexto: ${lead.businessContext}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const { data: deal, error: dealError } = await supabase
    .from("deals")
    .insert({
      user_id: accountOwnerId,
      pipeline_id: pipeline.id,
      stage_id: firstStage.id,
      contact_id: contact.id,
      title: `${lead.service || "Servicio"} - ${lead.name || "Lead demo"}`,
      value: 0,
      currency: "USD",
      notes: notes || null,
      status: "open",
    })
    .select()
    .single();

  if (dealError || !deal) {
    return NextResponse.json(
      { error: dealError?.message ?? "Failed to create demo deal" },
      { status: 500 },
    );
  }

  return NextResponse.json({ contact, deal, pipeline });
}
