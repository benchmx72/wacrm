import type { SupabaseClient } from '@supabase/supabase-js'
import { loadAppointmentSettings } from '@/lib/appointments/settings'

type AppointmentContextRow = {
  id: string
  title: string
  appointment_type: string | null
  status: 'proposed' | 'confirmed' | 'cancelled' | 'completed'
  preferred_time: string | null
  scheduled_start: string | null
  scheduled_end: string | null
  timezone: string | null
  location: string | null
  notes: string | null
  updated_at: string
}

type AppointmentChangeRequestRow = {
  request_type: 'cancel' | 'reschedule'
  requested_text: string
  requested_time: string | null
  created_at: string
  appointment: { title: string } | { title: string }[] | null
}

const STATUS_LABELS: Record<AppointmentContextRow['status'], string> = {
  proposed: 'propuesta, pendiente de confirmacion',
  confirmed: 'confirmada',
  cancelled: 'cancelada',
  completed: 'completada',
}

export async function buildContactAppointmentContext(input: {
  supabase: SupabaseClient
  accountOwnerId: string
  contactId: string
}) {
  const [{ data, error }, { data: pendingRequests, error: pendingError }] =
    await Promise.all([
      input.supabase
        .from('appointments')
        .select(
          'id, title, appointment_type, status, preferred_time, scheduled_start, scheduled_end, timezone, location, notes, updated_at',
        )
        .eq('user_id', input.accountOwnerId)
        .eq('contact_id', input.contactId)
        .in('status', ['proposed', 'confirmed'])
        .order('updated_at', { ascending: false })
        .limit(20),
      input.supabase
        .from('appointment_change_requests')
        .select(
          'request_type, requested_text, requested_time, created_at, appointment:appointments(title)',
        )
        .eq('user_id', input.accountOwnerId)
        .eq('contact_id', input.contactId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(3),
    ])

  if (error) {
    console.error('[appointments/context] lookup failed:', error.message)
    return appointmentInstructions([], [])
  }

  if (pendingError) {
    console.error('[appointments/context] pending request lookup failed:', pendingError.message)
  }

  const settings = await loadAppointmentSettings(
    input.supabase,
    input.accountOwnerId,
  ).catch((settingsError) => {
    console.error(
      '[appointments/context] settings lookup failed:',
      settingsError instanceof Error ? settingsError.message : settingsError,
    )
    return null
  })

  const now = Date.now()
  const rows = ((data ?? []) as AppointmentContextRow[]).sort((a, b) => {
    const aTime = a.scheduled_start ? new Date(a.scheduled_start).getTime() : Infinity
    const bTime = b.scheduled_start ? new Date(b.scheduled_start).getTime() : Infinity
    const aUpcoming = aTime >= now
    const bUpcoming = bTime >= now

    if (aUpcoming !== bUpcoming) return aUpcoming ? -1 : 1
    if (aTime !== bTime) return aUpcoming ? aTime - bTime : bTime - aTime
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  })

  const defaultTimezone = settings?.default_timezone ?? 'America/Santarem'
  const relevant = rows.slice(0, 3)

  return appointmentInstructions(
    relevant.map((appointment, index) =>
      formatAppointment(appointment, defaultTimezone, index + 1),
    ),
    ((pendingRequests ?? []) as AppointmentChangeRequestRow[]).map(
      formatPendingRequest,
    ),
  )
}

function appointmentInstructions(appointments: string[], pendingRequests: string[]) {
  return [
    'Appointment information from the CRM:',
    ...(appointments.length > 0
      ? appointments
      : ['- No active proposed or confirmed appointment is registered for this contact.']),
    '',
    'Pending customer appointment change requests:',
    ...(pendingRequests.length > 0
      ? pendingRequests
      : ['- No pending cancellation or rescheduling request is registered.']),
    '',
    'Appointment response rules:',
    '- Treat the CRM appointment information above as the only reliable source for appointment dates and times.',
    '- If the customer asks when their appointment is, answer with the exact saved date, time, timezone, and location when available.',
    '- If it is only proposed or has no scheduled date, clearly say it is pending confirmation or that the exact time is not yet defined.',
    '- If no active appointment is registered, say so and offer to help schedule one.',
    '- Never invent, infer, or promise an appointment date or time that is not present above.',
    '- If a pending change request exists, clearly say it is awaiting staff review and do not claim the appointment was already changed.',
  ].join('\n')
}

function formatPendingRequest(request: AppointmentChangeRequestRow) {
  const appointment = Array.isArray(request.appointment)
    ? request.appointment[0]
    : request.appointment
  const action = request.request_type === 'cancel' ? 'cancellation' : 'rescheduling'

  return [
    `- Pending ${action} request for: ${appointment?.title ?? 'appointment'}.`,
    `  Customer message: ${request.requested_text}`,
    request.requested_time ? `  Requested timing: ${request.requested_time}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

function formatAppointment(
  appointment: AppointmentContextRow,
  defaultTimezone: string,
  position: number,
) {
  const timezone = appointment.timezone?.trim() || defaultTimezone
  const start = appointment.scheduled_start
    ? formatDateTime(appointment.scheduled_start, timezone)
    : null
  const end = appointment.scheduled_end
    ? formatDateTime(appointment.scheduled_end, timezone)
    : null
  const timing = appointment.scheduled_start
    ? new Date(appointment.scheduled_start).getTime() >= Date.now()
      ? 'upcoming'
      : 'past'
    : 'date not scheduled'

  return [
    `Appointment ${position}:`,
    `  - Title: ${appointment.title}`,
    `  - Status: ${STATUS_LABELS[appointment.status]}`,
    `  - Timing: ${timing}`,
    appointment.appointment_type
      ? `  - Type: ${appointment.appointment_type}`
      : '',
    start ? `  - Scheduled start: ${start}` : '  - Scheduled start: not defined',
    end ? `  - Scheduled end: ${end}` : '',
    `  - Timezone: ${timezone}`,
    appointment.preferred_time
      ? `  - Preferred time: ${appointment.preferred_time}`
      : '',
    appointment.location ? `  - Location/modality: ${appointment.location}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

function formatDateTime(value: string, timezone: string) {
  try {
    return new Intl.DateTimeFormat('es-ES', {
      dateStyle: 'full',
      timeStyle: 'short',
      timeZone: timezone,
    }).format(new Date(value))
  } catch {
    return new Intl.DateTimeFormat('es-ES', {
      dateStyle: 'full',
      timeStyle: 'short',
      timeZone: 'UTC',
    }).format(new Date(value))
  }
}
