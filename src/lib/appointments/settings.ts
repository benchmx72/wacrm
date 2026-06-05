import type { SupabaseClient } from '@supabase/supabase-js'

export const DEFAULT_APPOINTMENT_TIMEZONE =
  process.env.APPOINTMENT_DEFAULT_TIMEZONE?.trim() ||
  process.env.NEXT_PUBLIC_DEFAULT_TIMEZONE?.trim() ||
  'America/Santarem'

export const DEFAULT_APPOINTMENT_DURATION_MINUTES =
  Number(process.env.APPOINTMENT_DEFAULT_DURATION_MINUTES ?? 30) || 30

export type AppointmentSettings = {
  default_timezone: string
  default_duration_minutes: number
  default_location: string | null
  staff_notification_email: string | null
  notify_client: boolean
  notify_staff: boolean
  reminder_24h_enabled: boolean
  reminder_2h_enabled: boolean
  reminder_channel_enabled: boolean
  availability_days: number[]
  availability_start_time: string
  availability_end_time: string
  buffer_minutes: number
  no_availability_message: string | null
}

type AppointmentSettingsRow = Partial<AppointmentSettings> | null

const DEFAULT_AVAILABILITY_DAYS = [1, 2, 3, 4, 5]
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

function normalizeAvailabilityDays(value: unknown) {
  if (!Array.isArray(value)) return DEFAULT_AVAILABILITY_DAYS
  const days = value
    .map((day) => Number(day))
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
  return Array.from(new Set(days)).sort((a, b) => a - b)
}

function normalizeTime(value: unknown, fallback: string) {
  return typeof value === 'string' && TIME_PATTERN.test(value) ? value : fallback
}

export function normalizeAppointmentSettings(
  row?: AppointmentSettingsRow,
): AppointmentSettings {
  const duration = Number(row?.default_duration_minutes)

  return {
    default_timezone:
      row?.default_timezone?.trim() || DEFAULT_APPOINTMENT_TIMEZONE,
    default_duration_minutes:
      Number.isFinite(duration) && duration >= 5 && duration <= 480
        ? duration
        : DEFAULT_APPOINTMENT_DURATION_MINUTES,
    default_location: row?.default_location?.trim() || null,
    staff_notification_email:
      row?.staff_notification_email?.trim().toLowerCase() || null,
    notify_client: row?.notify_client ?? true,
    notify_staff: row?.notify_staff ?? true,
    reminder_24h_enabled: row?.reminder_24h_enabled ?? true,
    reminder_2h_enabled: row?.reminder_2h_enabled ?? true,
    reminder_channel_enabled: row?.reminder_channel_enabled ?? true,
    availability_days: normalizeAvailabilityDays(row?.availability_days),
    availability_start_time: normalizeTime(row?.availability_start_time, '09:00'),
    availability_end_time: normalizeTime(row?.availability_end_time, '17:00'),
    buffer_minutes:
      Number.isFinite(Number(row?.buffer_minutes)) &&
      Number(row?.buffer_minutes) >= 0 &&
      Number(row?.buffer_minutes) <= 240
        ? Number(row?.buffer_minutes)
        : 0,
    no_availability_message:
      row?.no_availability_message?.trim() || null,
  }
}

export async function loadAppointmentSettings(
  supabase: SupabaseClient,
  accountOwnerId: string,
) {
  const { data, error } = await supabase
    .from('appointment_settings')
    .select(
      'default_timezone, default_duration_minutes, default_location, staff_notification_email, notify_client, notify_staff, reminder_24h_enabled, reminder_2h_enabled, reminder_channel_enabled, availability_days, availability_start_time, availability_end_time, buffer_minutes, no_availability_message',
    )
    .eq('user_id', accountOwnerId)
    .maybeSingle()

  if (error) {
    const code = 'code' in error ? error.code : ''
    if (code === '42P01' || code === 'PGRST205') {
      return normalizeAppointmentSettings()
    }
    throw error
  }

  return normalizeAppointmentSettings(data)
}
