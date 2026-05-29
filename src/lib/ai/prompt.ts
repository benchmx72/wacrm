import { AGENT_PROMPT_PRESETS, SDR_AGENT_PROMPT } from "./agents/sdr";

export const DEFAULT_AGENT_PROMPT = SDR_AGENT_PROMPT;
export const DEFAULT_AGENT_PROMPT_PRESETS = AGENT_PROMPT_PRESETS;

export function buildAgentInstructions(input: {
  systemPrompt: string;
  contactContext?: string | null;
  sessionSummary?: string | null;
  mode?: "playground" | "live_messaging";
}) {
  const parts = [input.systemPrompt.trim()];

  if (input.contactContext?.trim()) {
    parts.push(`CRM context:\n${input.contactContext.trim()}`);
  }

  if (input.sessionSummary?.trim()) {
    parts.push(`Session summary so far:\n${input.sessionSummary.trim()}`);
  }

  if (input.mode === "live_messaging") {
    parts.push(
      [
        "Current operating mode:",
        "- You are responding to a real customer message through the CRM messaging channel.",
        "- Keep responses concise, natural, helpful, and in the customer's language.",
        "- Do not claim actions were completed unless the CRM actually performed them.",
        "- If a human should take over, say so briefly and ask for the minimum useful next detail.",
      ].join("\n"),
    );
  } else {
    parts.push(
      [
        "Current operating mode:",
        "- This is a playground test. Do not send external messages.",
        "- Do not create deals, meetings, contacts, or knowledge records directly.",
        "- If a tool would be useful, describe the recommended action briefly.",
      ].join("\n"),
    );
  }

  return parts.join("\n\n");
}
