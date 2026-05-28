import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { userHasPermission } from "@/lib/auth/server-permissions";
import { getServerAccountOwnerId } from "@/lib/auth/account";

const demoScenarios = {
  medical: {
    contact: {
      name: "Paciente Demo",
      phone: "+1555001001",
      company: "Clinica Demo",
    },
    messages: [
      "Hola, quiero agendar una consulta esta semana.",
      "Tengo molestias desde hace varios dias y quiero saber si tienen disponibilidad.",
      "Tambien me gustaria saber el costo de la consulta inicial.",
    ],
  },
  legal: {
    contact: {
      name: "Cliente Legal Demo",
      phone: "+1555002002",
      company: "Caso Demo",
    },
    messages: [
      "Hola, necesito hablar con un abogado por un problema laboral.",
      "Me dieron un documento para firmar y tengo dudas.",
      "Quiero saber si pueden revisar mi caso y cuanto cuesta la consulta.",
    ],
  },
  general: {
    contact: {
      name: "Cliente Demo",
      phone: "+1555003003",
      company: "Servicio Demo",
    },
    messages: [
      "Hola, vi su servicio y quiero saber si me pueden ayudar.",
      "Estoy comparando opciones y necesito resolver esto pronto.",
      "Me pueden explicar como seria el siguiente paso?",
    ],
  },
} as const;

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
  const scenarioKey =
    typeof body?.scenario === "string" && body.scenario in demoScenarios
      ? (body.scenario as keyof typeof demoScenarios)
      : "general";
  const scenario = demoScenarios[scenarioKey];
  const now = new Date();

  const { data: contact, error: contactError } = await supabase
    .from("contacts")
    .insert({
      user_id: accountOwnerId,
      ...scenario.contact,
    })
    .select()
    .single();

  if (contactError || !contact) {
    return NextResponse.json(
      { error: contactError?.message ?? "Failed to create demo contact" },
      { status: 500 },
    );
  }

  const lastMessageAt = now.toISOString();
  const { data: conversation, error: conversationError } = await supabase
    .from("conversations")
    .insert({
      user_id: accountOwnerId,
      contact_id: contact.id,
      status: "open",
      last_message_text: scenario.messages.at(-1),
      last_message_at: lastMessageAt,
      unread_count: scenario.messages.length,
    })
    .select("*, contact:contacts(*)")
    .single();

  if (conversationError || !conversation) {
    return NextResponse.json(
      {
        error:
          conversationError?.message ?? "Failed to create demo conversation",
      },
      { status: 500 },
    );
  }

  const rows = scenario.messages.map((content, index) => ({
    conversation_id: conversation.id,
    sender_type: "customer",
    content_type: "text",
    content_text: content,
    status: "delivered",
    created_at: new Date(now.getTime() - (scenario.messages.length - index) * 60_000)
      .toISOString(),
  }));

  const { error: messagesError } = await supabase.from("messages").insert(rows);

  if (messagesError) {
    return NextResponse.json({ error: messagesError.message }, { status: 500 });
  }

  return NextResponse.json({ conversation });
}
