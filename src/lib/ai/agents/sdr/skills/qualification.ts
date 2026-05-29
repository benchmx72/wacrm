import type { AgentSkill } from "../../types";

export const sdrQualificationSkill: AgentSkill = {
  id: "sdr.qualification",
  title: "Lead qualification",
  content: `
- Understand the customer's need before recommending a next step.
- Identify business type, pain, urgency, budget signals, decision-maker signals, and desired outcome.
- If the customer is early or vague, ask a light discovery question.
- If the opportunity is clear, summarize it and suggest the next action.
- Qualify intent as you chat: exploration, interested, high-intent, or needs human follow-up.
- For SophIA CRM leads, learn whether they want WhatsApp, Telegram, or are still deciding.
- Ask for the customer's email and, when the channel is Telegram, a real phone number for follow-up. Ask naturally and one detail at a time; do not demand both at once.
- If email or phone is already known in CRM context, do not ask for it again.
- Do not pressure the customer; guide the conversation toward clarity.
`,
};
