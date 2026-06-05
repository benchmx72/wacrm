import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServerAccountOwnerId } from '@/lib/auth/account'
import { userHasPermission } from '@/lib/auth/server-permissions'
import { queueAppointmentNotifications } from '@/lib/appointments/notifications'
import { loadAppointmentSettings } from '@/lib/appointments/settings'
import { parseRequestedAppointmentTime } from '@/lib/appointments/parse-requested-time'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await userHasPermission(supabase, user.id, 'manage_appointments'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const accountOwnerId = await getServerAccountOwnerId(supabase, user.id)
  const { id } = await params
  const body = await request.json().catch(() => null)
  const action = body?.action

  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  const { data: changeRequest, error: requestError } = await supabase
    .from('appointment_change_requests')
    .select('id, appointment_id, request_type, requested_text, requested_time, status')
    .eq('id', id)
    .eq('user_id', accountOwnerId)
    .maybeSingle()

  if (requestError) return NextResponse.json({ error: requestError.message }, { status: 500 })
  if (!changeRequest) return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  if (changeRequest.status !== 'pending') {
    return NextResponse.json({ error: 'Request already resolved' }, { status: 409 })
  }

  if (action === 'reject') {
    const { data, error } = await supabase
      .from('appointment_change_requests')
      .update({
        status: 'rejected',
        resolved_by: user.id,
        resolved_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('status', 'pending')
      .select('id, status')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ request: data })
  }

  const { data: appointment, error: appointmentError } = await supabase
    .from('appointments')
    .select('*, contact:contacts(name, phone, email)')
    .eq('id', changeRequest.appointment_id)
    .eq('user_id', accountOwnerId)
    .maybeSingle()

  if (appointmentError) {
    return NextResponse.json({ error: appointmentError.message }, { status: 500 })
  }
  if (!appointment) {
    return NextResponse.json({ error: 'Appointment not found' }, { status: 404 })
  }

  let update:
    | { status: 'cancelled' }
    | {
        status: 'proposed' | 'confirmed'
        preferred_time: string
        scheduled_start: string | null
        scheduled_end: string | null
      }

  if (changeRequest.request_type === 'cancel') {
    update = { status: 'cancelled' }
  } else {
    const preferredTime = changeRequest.requested_time ?? changeRequest.requested_text
    const settings = await loadAppointmentSettings(supabase, accountOwnerId)
    const timezone =
      (appointment.timezone as string | null)?.trim() || settings.default_timezone
    const parsed = parseRequestedAppointmentTime({
      text: preferredTime,
      timezone,
      durationMinutes: settings.default_duration_minutes,
    })

    update = {
      status: parsed ? 'confirmed' : 'proposed',
      preferred_time: preferredTime,
      scheduled_start: parsed?.scheduled_start ?? null,
      scheduled_end: parsed?.scheduled_end ?? null,
    }
  }

  const { data: updatedAppointment, error: updateError } = await supabase
    .from('appointments')
    .update(update)
    .eq('id', appointment.id)
    .eq('user_id', accountOwnerId)
    .select('*, contact:contacts(name, phone, email)')
    .single()

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  const { error: resolveError } = await supabase
    .from('appointment_change_requests')
    .update({
      status: 'approved',
      resolved_by: user.id,
      resolved_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('status', 'pending')

  if (resolveError) return NextResponse.json({ error: resolveError.message }, { status: 500 })

  await queueAppointmentNotifications({
    supabase,
    accountOwnerId,
    appointment: updatedAppointment,
    eventType: changeRequest.request_type === 'cancel' ? 'cancelled' : 'updated',
    actorUserId: user.id,
  })

  return NextResponse.json({
    request: { id, status: 'approved' },
    appointment: updatedAppointment,
  })
}
