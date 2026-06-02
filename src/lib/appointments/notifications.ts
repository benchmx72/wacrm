import type { SupabaseClient } from '@supabase/supabase-js'

export type AppointmentNotificationEvent =
  | 'proposal_created'
  | 'confirmed'
  | 'updated'
  | 'cancelled'
  | 'completed'

type AppointmentNotificationRow = {
  id: string
  title: string
  appointment_type?: string | null
  status: string
  preferred_time?: string | null
  scheduled_start?: string | null
  scheduled_end?: string | null
  timezone?: string | null
  location?: string | null
  notes?: string | null
  contact_id?: string | null
  contact?: {
    name?: string | null
    phone?: string | null
    email?: string | null
  } | null
}

type QueueInput = {
  supabase: SupabaseClient
  accountOwnerId: string
  appointment: AppointmentNotificationRow
  eventType: AppointmentNotificationEvent
  actorUserId?: string
}

type Recipient = {
  type: 'client' | 'staff'
  email: string | null
  name: string
}

const EVENT_LABELS: Record<AppointmentNotificationEvent, string> = {
  proposal_created: 'Cita propuesta',
  confirmed: 'Cita confirmada',
  updated: 'Cita actualizada',
  cancelled: 'Cita cancelada',
  completed: 'Cita completada',
}

export async function queueAppointmentNotifications({
  supabase,
  accountOwnerId,
  appointment,
  eventType,
  actorUserId,
}: QueueInput) {
  try {
    const recipients = await loadRecipients(supabase, accountOwnerId, appointment)
    if (recipients.length === 0) return

    const rows = recipients.map((recipient) => {
      const content = buildNotificationContent(appointment, eventType, recipient)
      return {
        user_id: accountOwnerId,
        appointment_id: appointment.id,
        contact_id: appointment.contact_id ?? null,
        recipient_type: recipient.type,
        recipient_email: recipient.email,
        channel: 'email',
        event_type: eventType,
        subject: content.subject,
        body_text: content.body,
        ics_content: content.ics,
        status: recipient.email ? 'pending' : 'skipped',
        error_message: recipient.email ? null : 'Recipient email missing',
        metadata: {
          actor_user_id: actorUserId ?? null,
          appointment_status: appointment.status,
          timezone: appointment.timezone ?? null,
        },
      }
    })

    const { error } = await supabase.from('appointment_notifications').insert(rows)
    if (error) {
      console.error('[appointments] notification queue failed:', error.message)
    }
  } catch (error) {
    console.error('[appointments] notification queue failed:', error)
  }
}

async function loadRecipients(
  supabase: SupabaseClient,
  accountOwnerId: string,
  appointment: AppointmentNotificationRow,
): Promise<Recipient[]> {
  const recipients: Recipient[] = [
    {
      type: 'client',
      email: appointment.contact?.email ?? null,
      name:
        appointment.contact?.name ??
        appointment.contact?.phone ??
        'Cliente',
    },
  ]

  const { data, error } = await supabase
    .from('profiles')
    .select('full_name, email, status')
    .eq('account_owner_id', accountOwnerId)
    .order('created_at', { ascending: true })

  if (error) throw error

  for (const profile of (data ?? []) as Array<{
    full_name: string | null
    email: string | null
    status?: string | null
  }>) {
    if (profile.status && profile.status !== 'active') continue

    recipients.push({
      type: 'staff',
      email: profile.email ?? null,
      name: profile.full_name ?? profile.email ?? 'Staff',
    })
  }

  return recipients
}

function buildNotificationContent(
  appointment: AppointmentNotificationRow,
  eventType: AppointmentNotificationEvent,
  recipient: Recipient,
) {
  const eventLabel = EVENT_LABELS[eventType]
  const subject = `${eventLabel}: ${appointment.title}`
  const dateLine = appointment.scheduled_start
    ? `Fecha: ${formatDate(appointment.scheduled_start, appointment.timezone)}`
    : `Horario preferido: ${appointment.preferred_time ?? 'Por confirmar'}`

  const body = [
    `Hola ${recipient.name},`,
    '',
    `${eventLabel} en SophIA CRM.`,
    '',
    `Cita: ${appointment.title}`,
    appointment.appointment_type ? `Tipo: ${appointment.appointment_type}` : '',
    dateLine,
    appointment.location ? `Lugar/modalidad: ${appointment.location}` : '',
    appointment.notes ? `Notas: ${appointment.notes}` : '',
    '',
    recipient.type === 'staff'
      ? 'Revisa el CRM para confirmar detalles, reprogramar o cerrar seguimiento.'
      : 'Si necesitas cambiar el horario, responde por el canal donde iniciamos la conversacion.',
  ]
    .filter(Boolean)
    .join('\n')

  return {
    subject,
    body,
    ics: buildIcs(appointment, eventType),
  }
}

function buildIcs(
  appointment: AppointmentNotificationRow,
  eventType: AppointmentNotificationEvent,
) {
  if (!appointment.scheduled_start) return null

  const start = new Date(appointment.scheduled_start)
  if (Number.isNaN(start.getTime())) return null

  const end = appointment.scheduled_end
    ? new Date(appointment.scheduled_end)
    : new Date(start.getTime() + 30 * 60_000)

  if (Number.isNaN(end.getTime())) return null

  const method = eventType === 'cancelled' ? 'CANCEL' : 'REQUEST'
  const status = eventType === 'cancelled' ? 'CANCELLED' : 'CONFIRMED'

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SophIA CRM//Appointments//ES',
    `METHOD:${method}`,
    'BEGIN:VEVENT',
    `UID:${appointment.id}@sophia-crm`,
    `DTSTAMP:${toIcsDate(new Date())}`,
    `DTSTART:${toIcsDate(start)}`,
    `DTEND:${toIcsDate(end)}`,
    `SUMMARY:${escapeIcs(appointment.title)}`,
    `DESCRIPTION:${escapeIcs(appointment.notes ?? appointment.preferred_time ?? '')}`,
    appointment.location ? `LOCATION:${escapeIcs(appointment.location)}` : '',
    `STATUS:${status}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .filter(Boolean)
    .join('\r\n')
}

function toIcsDate(date: Date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

function escapeIcs(value: string) {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
}

function formatDate(value: string, timezone?: string | null) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  try {
    return new Intl.DateTimeFormat('es-419', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: timezone || undefined,
    }).format(date)
  } catch {
    return new Intl.DateTimeFormat('es-419', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date)
  }
}
