import { AGENT_PROMPT_PRESETS, SDR_AGENT_PROMPT } from "./agents/sdr";

export const DEFAULT_AGENT_PROMPT = SDR_AGENT_PROMPT;
export const DEFAULT_AGENT_PROMPT_PRESETS = AGENT_PROMPT_PRESETS;

export function buildAgentInstructions(input: {
  systemPrompt: string;
  contactContext?: string | null;
  sessionSummary?: string | null;
}) {
  const parts = [input.systemPrompt.trim()];

  if (input.contactContext?.trim()) {
    parts.push(`CRM context:\n${input.contactContext.trim()}`);
  }

  if (input.sessionSummary?.trim()) {
    parts.push(`Session summary so far:\n${input.sessionSummary.trim()}`);
  }

  parts.push(
    [
      "Current operating mode:",
      "- This is a playground test. Do not send external messages.",
      "- Do not create deals, meetings, contacts, or knowledge records directly.",
      "- If a tool would be useful, describe the recommended action briefly.",
    ].join("\n"),
  );

  return parts.join("\n\n");
}
