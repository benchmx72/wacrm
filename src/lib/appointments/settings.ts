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
}

type AppointmentSettingsRow = Partial<AppointmentSettings> | null

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
  }
}

export async function loadAppointmentSettings(
  supabase: SupabaseClient,
  accountOwnerId: string,
) {
  const { data, error } = await supabase
    .from('appointment_settings')
    .select(
      'default_timezone, default_duration_minutes, default_location, staff_notification_email, notify_client, notify_staff',
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
