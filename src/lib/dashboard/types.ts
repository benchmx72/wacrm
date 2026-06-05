// Shared result shapes the dashboard components consume. Centralised
// here so each component stays thin and the page-level loader wires
// them up without type gymnastics.

export interface MetricDelta {
  current: number
  previous: number
}

export interface MetricsBundle {
  activeConversations: MetricDelta
  newContactsToday: MetricDelta
  qualifiedLeadsCount: number
  hotLeadsCount: number
  proposedAppointmentsCount: number
  confirmedAppointmentsCount: number
  openDealsValue: number
  openDealsCount: number
  messagesSentToday: MetricDelta
}

export interface ConversationsSeriesPoint {
  day: string // YYYY-MM-DD local
  incoming: number
  outgoing: number
}

export interface PipelineStageSlice {
  id: string
  name: string
  color: string
  dealCount: number
  totalValue: number
}

export interface PipelineDonutData {
  stages: PipelineStageSlice[]
  totalValue: number
}

export interface ResponseTimeBucket {
  /** 0 = Mon … 6 = Sun (Monday-first). */
  dow: number
  /** Average first-response time in minutes. Null means no samples. */
  avgMinutes: number | null
  samples: number
}

export interface ResponseTimeSummary {
  buckets: ResponseTimeBucket[]
  thisWeekAvg: number | null
  lastWeekAvg: number | null
}

export interface ChannelBreakdown {
  telegram: {
    conversations: number
    contacts: number
  }
  whatsapp: {
    conversations: number
    contacts: number
  }
}

export type OperationalAlertKind =
  | 'appointment_request'
  | 'notification_failed'

export interface OperationalAlert {
  id: string
  kind: OperationalAlertKind
  title: string
  primary: string | null
  detail: string | null
  at: string
  href: string
}

export interface DashboardAppointment {
  id: string
  title: string
  status: 'proposed' | 'confirmed' | 'cancelled' | 'completed'
  preferredTime: string | null
  scheduledStart: string | null
  createdAt: string
  contactName: string | null
  contactPhone: string | null
}

export type ActivityKind =
  | 'message'
  | 'deal'
  | 'broadcast'
  | 'automation'
  | 'contact'

export interface ActivityItem {
  id: string
  kind: ActivityKind
  /** Primary line of text rendered in the feed. Pre-formatted. */
  text: string
  /** ISO timestamp the item happened at, drives relative-time + sort. */
  at: string
  /** Optional deep-link for the whole row (not all items have a target). */
  href?: string
}
