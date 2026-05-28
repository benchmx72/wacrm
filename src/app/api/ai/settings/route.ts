import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  DEFAULT_AGENT_PROMPT,
  DEFAULT_AGENT_PROMPT_PRESETS,
} from "@/lib/ai/prompt";
import { getServerAccountOwnerId } from "@/lib/auth/account";

async function getOrCreateDefaultAgent(userId: string) {
  const supabase = await createClient();

  const { data: existing, error: fetchError } = await supabase
    .from("ai_agents")
    .select("*")
    .eq("user_id", userId)
    .eq("role", "support_sdr")
    .maybeSingle();

  if (fetchError) throw fetchError;
  if (existing) return existing;

  const { data: created, error: createError } = await supabase
    .from("ai_agents")
    .insert({
      user_id: userId,
      name: "Rod SDR",
      role: "support_sdr",
      model: "gpt-4.1-mini",
      temperature: 0.4,
      is_active: true,
      system_prompt: DEFAULT_AGENT_PROMPT,
      knowledge_mode: "suggestions",
    })
    .select()
    .single();

  if (createError) throw createError;
  return created;
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const accountOwnerId = await getServerAccountOwnerId(supabase, user.id);
    const agent = await getOrCreateDefaultAgent(accountOwnerId);
    return NextResponse.json({
      agent,
      defaultPrompt: DEFAULT_AGENT_PROMPT,
      promptPresets: DEFAULT_AGENT_PROMPT_PRESETS,
      openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load AI settings";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const accountOwnerId = await getServerAccountOwnerId(supabase, user.id);
  const agent = await getOrCreateDefaultAgent(accountOwnerId);
  const temperature = Number(body.temperature);

  const update = {
    name: String(body.name ?? agent.name).trim() || agent.name,
    model: String(body.model ?? agent.model).trim() || agent.model,
    temperature: Number.isFinite(temperature)
      ? Math.min(2, Math.max(0, temperature))
      : agent.temperature,
    is_active: Boolean(body.is_active),
    system_prompt:
      String(body.system_prompt ?? agent.system_prompt).trim() || DEFAULT_AGENT_PROMPT,
    knowledge_mode: ["off", "suggestions", "approved_only"].includes(body.knowledge_mode)
      ? body.knowledge_mode
      : agent.knowledge_mode,
    openai_vector_store_id:
      String(body.openai_vector_store_id ?? "").trim() || null,
  };

  const { data, error } = await supabase
    .from("ai_agents")
    .update(update)
    .eq("id", agent.id)
    .eq("user_id", accountOwnerId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    agent: data,
    defaultPrompt: DEFAULT_AGENT_PROMPT,
    promptPresets: DEFAULT_AGENT_PROMPT_PRESETS,
    openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
  });
}
