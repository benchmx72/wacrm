export interface AgentSkill {
  id: string;
  title: string;
  content: string;
}

export function composeAgentSkills(input: {
  identity: string;
  skills: AgentSkill[];
}) {
  const sections = input.skills.map((skill) =>
    [`Skill: ${skill.title}`, skill.content.trim()].join("\n"),
  );

  return [input.identity.trim(), ...sections].join("\n\n");
}
