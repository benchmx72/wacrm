"use client"

import { useMemo } from "react"
import { useSearchParams } from "next/navigation"

import {
  AutomationBuilder,
  type BuilderInitial,
  type BuilderStep,
} from "@/components/automations/automation-builder"
import { useLanguage } from "@/hooks/use-language"
import { AUTOMATION_TEMPLATES, type TemplateSlug } from "@/lib/automations/templates"
import type { TranslationKey } from "@/lib/i18n"
import type { AutomationStepType, AutomationTriggerType } from "@/types"

const TEMPLATE_MESSAGE_KEYS: Record<TemplateSlug, TranslationKey> = {
  welcome_message: "automations.builder.templateMessages.welcome",
  out_of_office: "automations.builder.templateMessages.outOfOffice",
  lead_qualifier: "automations.builder.templateMessages.leadQualifier",
  follow_up_reminder: "automations.builder.templateMessages.followUpReminder",
}

export default function NewAutomationPage() {
  const params = useSearchParams()
  const template = params.get("template") as TemplateSlug | null
  const { t } = useLanguage()

  const initial: BuilderInitial = useMemo(() => {
    if (template && AUTOMATION_TEMPLATES[template]) {
      const definition = AUTOMATION_TEMPLATES[template]
      const triggerConfig = {
        ...(definition.trigger_config as Record<string, unknown>),
      }
      if (template === "lead_qualifier") {
        triggerConfig.keywords = t("automations.builder.templateKeywords.leadQualifier")
          .split(",")
          .map((keyword) => keyword.trim())
          .filter(Boolean)
      }
      const steps = expandFromSeeds(
        definition.steps.map((seed, idx) => ({
          index: idx,
          step_type: seed.step_type,
          step_config:
            seed.step_type === "send_message"
              ? {
                  ...(seed.step_config as Record<string, unknown>),
                  text: t(TEMPLATE_MESSAGE_KEYS[template]),
                }
              : { ...(seed.step_config as Record<string, unknown>) },
          branch: seed.branch ?? null,
          parent_index: seed.parent_index ?? null,
        })),
      )
      return {
        name: t(`automations.templates.${template}.name` as TranslationKey),
        description: t(
          `automations.templates.${template}.description` as TranslationKey,
        ),
        trigger_type: definition.trigger_type,
        trigger_config: triggerConfig,
        is_active: false,
        steps,
      }
    }
    return {
      name: "",
      description: "",
      trigger_type: "new_message_received" as AutomationTriggerType,
      trigger_config: {},
      is_active: false,
      steps: [],
    }
  }, [template, t])

  return <AutomationBuilder initial={initial} />
}

interface SeedRow {
  index: number
  step_type: AutomationStepType
  step_config: Record<string, unknown>
  branch: "yes" | "no" | null
  parent_index: number | null
}

function uid(): string {
  return (
    "c_" +
    (typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36))
  )
}

/** Template seeds are flat with parent_index references. Expand into the
 *  builder's nested tree, preserving order within each scope. */
function expandFromSeeds(rows: SeedRow[]): BuilderStep[] {
  const nodes: BuilderStep[] = rows.map((r) => ({
    cid: uid(),
    step_type: r.step_type,
    step_config: r.step_config,
    branches:
      r.step_type === "condition" ? { yes: [], no: [] } : undefined,
  }))
  const roots: BuilderStep[] = []
  rows.forEach((r, i) => {
    if (r.parent_index == null) {
      roots.push(nodes[i])
      return
    }
    const parent = nodes[r.parent_index]
    if (!parent.branches) parent.branches = { yes: [], no: [] }
    parent.branches[r.branch ?? "yes"].push(nodes[i])
  })
  return roots
}
