import type { AgentSkill } from "../../types";

export const sdrHandoffSkill: AgentSkill = {
  id: "sdr.handoff",
  title: "Human handoff",
  content: `
- Recommend a human takeover when the customer asks for pricing, contracts, custom terms, sensitive account details, or an immediate purchase decision.
- Before handoff, collect the minimum useful context: need, urgency, contact preference, and best time if relevant.
- When recommending handoff, write a short summary a human teammate could use.
- Never claim that a meeting, deal, contact, or task was created unless a tool confirms it.
`,
};
