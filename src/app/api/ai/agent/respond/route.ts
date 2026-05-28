import { NextResponse } from "next/server";
import { createAgentResponse } from "@/lib/ai/openai";
import { buildAgentInstructions, DEFAULT_AGENT_PROMPT } from "@/lib/ai/prompt";
import { createClient } from "@/lib/supabase/server";
import { userHasPermission } from "@/lib/auth/server-permissions";

type DbMessage = {
  id?: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
};

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

function sanitizeLeadProfile(value: unknown): LeadProfile {
  if (!value || typeof value !== "object") return {};

  const input = value as Record<string, unknown>;
  const clean = (key: keyof LeadProfile) =>
    typeof input[key] === "string" ? input[key].trim().slice(0, 300) : "";

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

function formatLeadProfile(profile: LeadProfile) {
  const rows = [
    ["Name", profile.name],
    ["Service vertical", profile.service],
    ["Need", profile.need],
    ["Urgency", profile.urgency],
    ["Budget signal", profile.budget],
    ["Lead stage", profile.stage],
    ["Next action", profile.nextAction],
    ["Business demo context", profile.businessContext],
  ].filter(([, value]) => value);

  return rows.map(([label, value]) => `- ${label}: ${value}`).join("\n");
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await userHasPermission(supabase, user.id, "view_ai_playground"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: session, error: sessionError } = await supabase
    .from("ai_agent_sessions")
    .select("*")
    .eq("user_id", user.id)
    .eq("channel", "playground")
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (sessionError) {
    return NextResponse.json({ error: sessionError.message }, { status: 500 });
  }

  if (!session) {
    return NextResponse.json({ session: null, messages: [] });
  }

  const { data: messages, error: messagesError } = await supabase
    .from("ai_agent_messages")
    .select("id, role, content")
    .eq("session_id", session.id)
    .eq("user_id", user.id)
    .in("role", ["user", "assistant"])
    .order("created_at", { ascending: true })
    .limit(50);

  if (messagesError) {
    return NextResponse.json({ error: messagesError.message }, { status: 500 });
  }

  return NextResponse.json({ session, messages: messages ?? [] });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await userHasPermission(supabase, user.id, "view_ai_playground"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const message = String(body?.message ?? "").trim();
  const sessionId = typeof body?.session_id === "string" ? body.session_id : null;
  const leadProfile = sanitizeLeadProfile(body?.lead_profile);

  if (!message) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  const { data: agent, error: agentError } = await supabase
    .from("ai_agents")
    .select("*")
    .eq("user_id", user.id)
    .eq("role", "support_sdr")
    .maybeSingle();

  if (agentError) {
    return NextResponse.json({ error: agentError.message }, { status: 500 });
  }

  const activeAgent = agent ?? {
    id: null,
    name: "Rod SDR",
    model: "gpt-4.1-mini",
    temperature: 0.4,
    is_active: true,
    system_prompt: DEFAULT_AGENT_PROMPT,
  };

  if (!activeAgent.is_active) {
    return NextResponse.json(
      { error: "AI agent is paused in settings" },
      { status: 409 },
    );
  }

  let session =
    sessionId
      ? await supabase
          .from("ai_agent_sessions")
          .select("*")
          .eq("id", sessionId)
          .eq("user_id", user.id)
          .maybeSingle()
      : { data: null, error: null };

  if (session.error) {
    return NextResponse.json({ error: session.error.message }, { status: 500 });
  }

  if (!session.data) {
    session = await supabase
      .from("ai_agent_sessions")
      .insert({
        user_id: user.id,
        agent_id: activeAgent.id,
        channel: "playground",
        title: message.slice(0, 80),
        status: "active",
        metadata: { lead_profile: leadProfile },
      })
      .select()
      .single();

    if (session.error || !session.data) {
      return NextResponse.json(
        { error: session.error?.message ?? "Failed to create session" },
        { status: 500 },
      );
    }
  } else if (Object.values(leadProfile).some(Boolean)) {
    await supabase
      .from("ai_agent_sessions")
      .update({
        metadata: {
          ...((session.data.metadata as Record<string, unknown> | null) ?? {}),
          lead_profile: leadProfile,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", session.data.id)
      .eq("user_id", user.id);
  }

  const { error: userInsertError } = await supabase.from("ai_agent_messages").insert({
    user_id: user.id,
    session_id: session.data.id,
    role: "user",
    content: message,
  });

  if (userInsertError) {
    return NextResponse.json({ error: userInsertError.message }, { status: 500 });
  }

  const { data: recentMessages, error: messagesError } = await supabase
    .from("ai_agent_messages")
    .select("role, content")
    .eq("session_id", session.data.id)
    .eq("user_id", user.id)
    .in("role", ["user", "assistant"])
    .order("created_at", { ascending: false })
    .limit(16);

  if (messagesError) {
    return NextResponse.json({ error: messagesError.message }, { status: 500 });
  }

  const history = ((recentMessages ?? []) as DbMessage[])
    .reverse()
    .map((item) => ({
      role: item.role as "user" | "assistant",
      content: item.content,
    }));

  const { data: memoryMessages, error: memoryError } = await supabase
    .from("ai_agent_messages")
    .select("role, content")
    .eq("user_id", user.id)
    .neq("session_id", session.data.id)
    .in("role", ["user", "assistant"])
    .order("created_at", { ascending: false })
    .limit(20);

  if (memoryError) {
    return NextResponse.json({ error: memoryError.message }, { status: 500 });
  }

  const playgroundMemory = ((memoryMessages ?? []) as DbMessage[])
    .reverse()
    .map((item) => `${item.role}: ${item.content}`)
    .join("\n");
  const leadContext = formatLeadProfile(leadProfile);

  try {
    const result = await createAgentResponse({
      model: activeAgent.model,
      instructions: buildAgentInstructions({
        systemPrompt: activeAgent.system_prompt,
        contactContext: [
          leadContext ? `Demo lead profile:\n${leadContext}` : "",
          playgroundMemory
            ? `Recent playground memory from previous sessions:\n${playgroundMemory}`
            : "",
        ]
          .filter(Boolean)
          .join("\n\n"),
        sessionSummary: session.data.summary,
      }),
      messages: history,
      temperature: Number(activeAgent.temperature ?? 0.4),
    });

    const { data: assistantMessage, error: assistantInsertError } = await supabase
      .from("ai_agent_messages")
      .insert({
        user_id: user.id,
        session_id: session.data.id,
        role: "assistant",
        content: result.text,
        input_tokens: result.inputTokens,
        output_tokens: result.outputTokens,
        metadata: {
          model: activeAgent.model,
          source: "openai_responses",
        },
      })
      .select()
      .single();

    if (assistantInsertError) {
      return NextResponse.json({ error: assistantInsertError.message }, { status: 500 });
    }

    await supabase
      .from("ai_agent_sessions")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", session.data.id)
      .eq("user_id", user.id);

    return NextResponse.json({
      session: session.data,
      message: assistantMessage,
      reply: result.text,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI response failed";
    await supabase.from("ai_tool_logs").insert({
      user_id: user.id,
      agent_id: activeAgent.id,
      session_id: session.data.id,
      tool_name: "openai.responses",
      status: "failed",
      input: { model: activeAgent.model },
      error_message: message,
    });

    return NextResponse.json({ error: message }, { status: 502 });
  }
}
