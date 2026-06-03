import { NextResponse } from 'next/server'
import { getServerAccountOwnerId } from '@/lib/auth/account'
import { userHasPermission } from '@/lib/auth/server-permissions'
import {
  normalizeAppointmentSettings,
  type AppointmentSettings,
} from '@/lib/appointments/settings'
import { createClient } from '@/lib/supabase/server'

const SELECT =
  'user_id, default_timezone, default_duration_minutes, default_location, staff_notification_email, notify_client, notify_staff'

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
  const staffEmail = cleanText(body?.staff_notification_email, 254)?.toLowerCase()

  if (!timezone || !isValidTimezone(timezone)) {
    return NextResponse.json({ error: 'Invalid timezone' }, { status: 400 })
  }

  if (!Number.isFinite(duration) || duration < 5 || duration > 480) {
    return NextResponse.json({ error: 'Invalid duration' }, { status: 400 })
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
  }

  const { data, error } = await context.supabase
    .from('appointment_settings')
    .upsert(payload, { onConflict: 'user_id' })
    .select(SELECT)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ settings: normalizeAppointmentSettings(data) })
}
