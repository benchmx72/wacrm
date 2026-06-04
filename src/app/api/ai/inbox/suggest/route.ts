import { NextResponse } from "next/server";
import { createAgentResponse } from "@/lib/ai/openai";
import { buildAgentInstructions, DEFAULT_AGENT_PROMPT } from "@/lib/ai/prompt";
import { createClient } from "@/lib/supabase/server";
import { getServerAccountOwnerId } from "@/lib/auth/account";
import { buildContactAppointmentContext } from "@/lib/appointments/context";

type InboxMessage = {
  sender_type: "customer" | "agent" | "bot";
  content_text: string | null;
};

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const accountOwnerId = await getServerAccountOwnerId(supabase, user.id);

  const body = await request.json().catch(() => null);
  const conversationId =
    typeof body?.conversation_id === "string" ? body.conversation_id : "";

  if (!conversationId) {
    return NextResponse.json(
      { error: "conversation_id is required" },
      { status: 400 },
    );
  }

  const { data: conversation, error: conversationError } = await supabase
    .from("conversations")
    .select("*, contact:contacts(*)")
    .eq("id", conversationId)
    .eq("user_id", accountOwnerId)
    .maybeSingle();

  if (conversationError) {
    return NextResponse.json({ error: conversationError.message }, { status: 500 });
  }

  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const { data: agent, error: agentError } = await supabase
    .from("ai_agents")
    .select("*")
    .eq("user_id", accountOwnerId)
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

  const { data: messages, error: messagesError } = await supabase
    .from("messages")
    .select("sender_type, content_text")
    .eq("conversation_id", conversation.id)
    .order("created_at", { ascending: false })
    .limit(20);

  if (messagesError) {
    return NextResponse.json({ error: messagesError.message }, { status: 500 });
  }

  const history = ((messages ?? []) as InboxMessage[])
    .reverse()
    .filter((message) => message.content_text?.trim())
    .map((message) => ({
      role:
        message.sender_type === "customer"
          ? ("user" as const)
          : ("assistant" as const),
      content: message.content_text ?? "",
    }));

  if (history.length === 0) {
    return NextResponse.json(
      { error: "No text messages to use as context" },
      { status: 400 },
    );
  }

  const contact = conversation.contact as
    | { id?: string | null; name?: string | null; phone?: string | null; email?: string | null; company?: string | null }
    | null;
  const appointmentContext = contact?.id
    ? await buildContactAppointmentContext({
        supabase,
        accountOwnerId,
        contactId: contact.id,
      })
    : "";

  const contactContext = [
    "Inbox reply suggestion mode:",
    "- Draft one WhatsApp-ready reply only.",
    "- Do not send the message. The human agent will review and edit.",
    "- Keep it concise, natural, and useful.",
    "",
    "Contact:",
    `- Name: ${contact?.name ?? "Unknown"}`,
    `- Phone: ${contact?.phone ?? "Unknown"}`,
    contact?.email ? `- Email: ${contact.email}` : "",
    contact?.company ? `- Company: ${contact.company}` : "",
    `- Conversation status: ${conversation.status}`,
    "",
    appointmentContext,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const result = await createAgentResponse({
      model: activeAgent.model,
      instructions: buildAgentInstructions({
        systemPrompt: activeAgent.system_prompt,
        contactContext,
      }),
      messages: [
        ...history,
        {
          role: "user",
          content:
            "Draft the next best reply for the human agent to send. Return only the message text.",
        },
      ],
      temperature: Math.min(Number(activeAgent.temperature ?? 0.4), 0.7),
    });

    return NextResponse.json({ suggestion: result.text });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI suggestion failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
