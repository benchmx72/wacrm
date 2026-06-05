import { NextResponse } from 'next/server'
import { getServerAccountOwnerId } from '@/lib/auth/account'
import { userHasPermission } from '@/lib/auth/server-permissions'
import {
  normalizeAppointmentSettings,
  type AppointmentSettings,
} from '@/lib/appointments/settings'
import { createClient } from '@/lib/supabase/server'

const SELECT =
  'user_id, default_timezone, default_duration_minutes, default_location, staff_notification_email, notify_client, notify_staff, reminder_24h_enabled, reminder_2h_enabled, reminder_channel_enabled, availability_days, availability_start_time, availability_end_time, buffer_minutes, no_availability_message'

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

function cleanText(value: unknown, max = 500) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().slice(0, max)
  return trimmed || null
}

function isValidTimezone(value: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date())
    return true
  } catch {
    return false
  }
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function normalizeAvailabilityDays(value: unknown) {
  if (!Array.isArray(value)) return [1, 2, 3, 4, 5]
  return Array.from(
    new Set(
      value
        .map((day) => Number(day))
        .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6),
    ),
  ).sort((a, b) => a - b)
}

async function getContext() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return {
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    }
  }

  if (!(await userHasPermission(supabase, user.id, 'manage_appointments'))) {
    return {
      error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    }
  }

  return {
    supabase,
    accountOwnerId: await getServerAccountOwnerId(supabase, user.id),
  }
}

export async function GET() {
  const context = await getContext()
  if ('error' in context) return context.error

  const { data, error } = await context.supabase
    .from('appointment_settings')
    .select(SELECT)
    .eq('user_id', context.accountOwnerId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ settings: normalizeAppointmentSettings(data) })
}

export async function PATCH(request: Request) {
  const context = await getContext()
  if ('error' in context) return context.error

  const body = await request.json().catch(() => null)
  const timezone =
    typeof body?.default_timezone === 'string'
      ? body.default_timezone.trim()
      : ''
  const duration = Number(body?.default_duration_minutes)
  const bufferMinutes = Number(body?.buffer_minutes)
  const staffEmail = cleanText(body?.staff_notification_email, 254)?.toLowerCase()
  const availabilityDays = normalizeAvailabilityDays(body?.availability_days)
  const availabilityStartTime =
    typeof body?.availability_start_time === 'string'
      ? body.availability_start_time.trim()
      : ''
  const availabilityEndTime =
    typeof body?.availability_end_time === 'string'
      ? body.availability_end_time.trim()
      : ''

  if (!timezone || !isValidTimezone(timezone)) {
    return NextResponse.json({ error: 'Invalid timezone' }, { status: 400 })
  }

  if (!Number.isFinite(duration) || duration < 5 || duration > 480) {
    return NextResponse.json({ error: 'Invalid duration' }, { status: 400 })
  }

  if (availabilityDays.length === 0) {
    return NextResponse.json({ error: 'Invalid availability days' }, { status: 400 })
  }

  if (!TIME_PATTERN.test(availabilityStartTime) || !TIME_PATTERN.test(availabilityEndTime)) {
    return NextResponse.json({ error: 'Invalid availability hours' }, { status: 400 })
  }

  if (availabilityStartTime >= availabilityEndTime) {
    return NextResponse.json({ error: 'Availability end time must be after start time' }, { status: 400 })
  }

  if (!Number.isFinite(bufferMinutes) || bufferMinutes < 0 || bufferMinutes > 240) {
    return NextResponse.json({ error: 'Invalid buffer minutes' }, { status: 400 })
  }

  if (staffEmail && !isValidEmail(staffEmail)) {
    return NextResponse.json({ error: 'Invalid staff email' }, { status: 400 })
  }

  const payload: AppointmentSettings & { user_id: string } = {
    user_id: context.accountOwnerId,
    default_timezone: timezone,
    default_duration_minutes: Math.round(duration),
    default_location: cleanText(body?.default_location),
    staff_notification_email: staffEmail ?? null,
    notify_client: body?.notify_client !== false,
    notify_staff: body?.notify_staff !== false,
    reminder_24h_enabled: body?.reminder_24h_enabled !== false,
    reminder_2h_enabled: body?.reminder_2h_enabled !== false,
    reminder_channel_enabled: body?.reminder_channel_enabled !== false,
    availability_days: availabilityDays,
    availability_start_time: availabilityStartTime,
    availability_end_time: availabilityEndTime,
    buffer_minutes: Math.round(bufferMinutes),
    no_availability_message: cleanText(body?.no_availability_message, 1000),
  }

  const { data, error } = await context.supabase
    .from('appointment_settings')
    .upsert(payload, { onConflict: 'user_id' })
    .select(SELECT)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ settings: normalizeAppointmentSettings(data) })
}
