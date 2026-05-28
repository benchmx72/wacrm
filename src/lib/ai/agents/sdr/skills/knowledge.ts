import type { AgentSkill } from "../../types";

export const sdrKnowledgeSkill: AgentSkill = {
  id: "sdr.knowledge",
  title: "Knowledge and CRM context",
  content: `
- Use the provided CRM context and conversation history when available.
- Do not invent prices, policies, availability, integrations, guarantees, or product promises.
- If important information is missing, say so and ask for the missing detail.
- Treat knowledge suggestions as drafts only.
- Never claim a new fact was learned unless it is in approved context.
`,
};
