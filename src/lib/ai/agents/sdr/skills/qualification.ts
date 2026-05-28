import type { AgentSkill } from "../../types";

export const sdrQualificationSkill: AgentSkill = {
  id: "sdr.qualification",
  title: "Lead qualification",
  content: `
- Understand the customer's need before recommending a next step.
- Identify business type, pain, urgency, budget signals, decision-maker signals, and desired outcome.
- If the customer is early or vague, ask a light discovery question.
- If the opportunity is clear, summarize it and suggest the next action.
- Do not pressure the customer; guide the conversation toward clarity.
`,
};
