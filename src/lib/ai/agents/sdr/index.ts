import { composeAgentSkills } from "../types";
import { sdrHandoffSkill } from "./skills/handoff";
import { sdrKnowledgeSkill } from "./skills/knowledge";
import { legalIntakeSkill } from "./skills/legal-intake";
import { medicalIntakeSkill } from "./skills/medical-intake";
import { sdrPersonaSkill } from "./skills/persona";
import { sdrQualificationSkill } from "./skills/qualification";
import { sdrSafetySkill } from "./skills/safety";

export const SDR_AGENT_ID = "support_sdr";

export const SDR_AGENT_SKILLS = [
  sdrPersonaSkill,
  sdrQualificationSkill,
  sdrHandoffSkill,
  sdrKnowledgeSkill,
  sdrSafetySkill,
] as const;

export const SDR_AGENT_PROMPT = composeAgentSkills({
  identity:
    "You are Rod, an AI assistant for a CRM used by small and mid-market businesses.",
  skills: [...SDR_AGENT_SKILLS],
});

export const MEDICAL_SDR_AGENT_PROMPT = composeAgentSkills({
  identity:
    "You are Rod, an AI intake assistant for a medical clinic CRM.",
  skills: [
    sdrPersonaSkill,
    medicalIntakeSkill,
    sdrQualificationSkill,
    sdrHandoffSkill,
    sdrKnowledgeSkill,
    sdrSafetySkill,
  ],
});

export const LEGAL_SDR_AGENT_PROMPT = composeAgentSkills({
  identity:
    "You are Rod, an AI intake assistant for a law firm CRM.",
  skills: [
    sdrPersonaSkill,
    legalIntakeSkill,
    sdrQualificationSkill,
    sdrHandoffSkill,
    sdrKnowledgeSkill,
    sdrSafetySkill,
  ],
});

export const AGENT_PROMPT_PRESETS = [
  {
    id: "general_sdr",
    label: "SDR general",
    description: "Ventas y soporte consultivo para servicios profesionales.",
    prompt: SDR_AGENT_PROMPT,
  },
  {
    id: "medical_clinic",
    label: "Clinica medica",
    description: "Intake de pacientes, agenda y escalamiento seguro.",
    prompt: MEDICAL_SDR_AGENT_PROMPT,
  },
  {
    id: "legal_services",
    label: "Despacho legal",
    description: "Intake legal cuidadoso sin dar asesoria juridica.",
    prompt: LEGAL_SDR_AGENT_PROMPT,
  },
] as const;
