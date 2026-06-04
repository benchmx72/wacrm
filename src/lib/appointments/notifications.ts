import type { SupabaseClient } from '@supabase/supabase-js'
import {
  DEFAULT_APPOINTMENT_DURATION_MINUTES,
  DEFAULT_APPOINTMENT_TIMEZONE,
  loadAppointmentSettings,
  type AppointmentSettings,
} from '@/lib/appointments/settings'

export type AppointmentNotificationEvent =
  | 'proposal_created'
  | 'confirmed'
  | 'updated'
  | 'cancelled'
  | 'completed'
  | 'reminder_24h'
  | 'reminder_2h'

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

type NotificationContent = {
  subject: string
  body: string
  html: string
  ics: string | null
}

const EVENT_LABELS: Record<AppointmentNotificationEvent, string> = {
  proposal_created: 'Cita propuesta',
  confirmed: 'Cita confirmada',
  updated: 'Cita actualizada',
  cancelled: 'Cita cancelada',
  completed: 'Cita completada',
  reminder_24h: 'Recordatorio: tu cita es en menos de 24 horas',
  reminder_2h: 'Recordatorio: tu cita es en 2 horas',
}

export async function queueDueAppointmentReminders(supabase: SupabaseClient) {
  const now = new Date()
  const in24Hours = new Date(now.getTime() + 24 * 60 * 60_000)
  const { data, error } = await supabase
    .from('appointments')
    .select(
      'id, user_id, title, appointment_type, status, preferred_time, scheduled_start, scheduled_end, timezone, location, notes, contact_id, contact:contacts(name, phone, email)',
    )
    .eq('status', 'confirmed')
    .gt('scheduled_start', now.toISOString())
    .lte('scheduled_start', in24Hours.toISOString())

  if (error) throw error

  let queued = 0
  for (const raw of data ?? []) {
    const contact = Array.isArray(raw.contact) ? raw.contact[0] : raw.contact
    const appointment = { ...raw, contact } as AppointmentNotificationRow & {
      user_id: string
    }
    const start = new Date(appointment.scheduled_start ?? '')
    if (Number.isNaN(start.getTime())) continue

    const settings = await loadAppointmentSettings(supabase, appointment.user_id)
    const { data: ownerProfile } = await supabase
      .from('profiles')
      .select('messaging_channel')
      .eq('id', appointment.user_id)
      .maybeSingle()
    const hoursUntil = (start.getTime() - now.getTime()) / 3_600_000
    const eventType: AppointmentNotificationEvent | null =
      hoursUntil <= 2 && settings.reminder_2h_enabled
        ? 'reminder_2h'
        : hoursUntil > 2 && settings.reminder_24h_enabled
          ? 'reminder_24h'
          : null

    if (!eventType) continue

    const recipients = await loadRecipients(
      supabase,
      appointment.user_id,
      appointment,
      settings,
    )
    const rows: Array<Record<string, unknown>> = []

    for (const recipient of recipients) {
      const content = buildNotificationContent(
        appointment,
        eventType,
        recipient,
        settings,
      )
      rows.push({
        user_id: appointment.user_id,
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
        dedupe_key: reminderDedupeKey(
          appointment,
          eventType,
          recipient.type,
          'email',
          recipient.email ?? 'missing',
        ),
        metadata: {
          appointment_status: appointment.status,
          html_body: content.html,
          timezone: appointment.timezone ?? settings.default_timezone,
          reminder: true,
        },
      })
    }

    if (
      settings.reminder_channel_enabled &&
      ownerProfile?.messaging_channel === 'telegram' &&
      appointment.contact_id &&
      appointment.contact?.phone?.startsWith('tg:')
    ) {
      const content = buildNotificationContent(
        appointment,
        eventType,
        {
          type: 'client',
          email: null,
          name: appointment.contact.name ?? 'Cliente',
        },
        settings,
      )
      rows.push({
        user_id: appointment.user_id,
        appointment_id: appointment.id,
        contact_id: appointment.contact_id,
        recipient_type: 'client',
        recipient_email: null,
        channel: 'telegram',
        event_type: eventType,
        subject: content.subject,
        body_text: content.body,
        ics_content: null,
        status: 'pending',
        error_message: null,
        dedupe_key: reminderDedupeKey(
          appointment,
          eventType,
          'client',
          'telegram',
          appointment.contact.phone,
        ),
        metadata: {
          appointment_status: appointment.status,
          timezone: appointment.timezone ?? settings.default_timezone,
          reminder: true,
        },
      })
    }

    if (rows.length === 0) continue
    const uniqueRows = Array.from(
      new Map(rows.map((row) => [String(row.dedupe_key), row])).values(),
    )
    const { data: inserted, error: insertError } = await supabase
      .from('appointment_notifications')
      .upsert(uniqueRows, { onConflict: 'dedupe_key', ignoreDuplicates: true })
      .select('id')
    if (insertError) throw insertError
    queued += inserted?.length ?? 0
  }

  return queued
}

function reminderDedupeKey(
  appointment: AppointmentNotificationRow,
  eventType: AppointmentNotificationEvent,
  recipientType: Recipient['type'],
  channel: 'email' | 'telegram',
  recipientKey: string,
) {
  return [
    appointment.id,
    appointment.scheduled_start,
    eventType,
    recipientType,
    channel,
    recipientKey,
  ].join(':')
}

export async function queueAppointmentNotifications({
  supabase,
  accountOwnerId,
  appointment,
  eventType,
  actorUserId,
}: QueueInput) {
  try {
    const settings = await loadAppointmentSettings(supabase, accountOwnerId)
    const recipients = await loadRecipients(supabase, accountOwnerId, appointment, settings)
    if (recipients.length === 0) return

    const rows = recipients.map((recipient) => {
      const content = buildNotificationContent(appointment, eventType, recipient, settings)
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
          html_body: content.html,
          timezone: appointment.timezone ?? settings.default_timezone,
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
  settings: AppointmentSettings,
): Promise<Recipient[]> {
  const recipients: Recipient[] = []

  if (settings.notify_client) {
    recipients.push({
      type: 'client',
      email: appointment.contact?.email ?? null,
      name:
        appointment.contact?.name ??
        appointment.contact?.phone ??
        'Cliente',
    })
  }

  if (!settings.notify_staff) return recipients

  if (settings.staff_notification_email) {
    recipients.push({
      type: 'staff',
      email: settings.staff_notification_email,
      name: 'Equipo',
    })
    return recipients
  }

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
  settings: AppointmentSettings,
): NotificationContent {
  const eventLabel = EVENT_LABELS[eventType]
  const subject = `${eventLabel}: ${appointment.title}`
  const dateLine = appointment.scheduled_start
    ? `Fecha: ${formatDate(appointment.scheduled_start, appointment.timezone, settings.default_timezone)}`
    : `Horario preferido: ${appointment.preferred_time ?? 'Por confirmar'}`
  const typeLine = appointment.appointment_type ? `Tipo: ${appointment.appointment_type}` : null
  const locationLine = appointment.location ? `Lugar/modalidad: ${appointment.location}` : null
  const notesLine = appointment.notes ? `Notas: ${appointment.notes}` : null
  const closing =
    recipient.type === 'staff'
      ? 'Revisa el CRM para confirmar detalles, reprogramar o cerrar seguimiento.'
      : 'Si necesitas cambiar el horario, responde por el canal donde iniciamos la conversacion.'

  const body = [
    `Hola ${recipient.name},`,
    '',
    `${eventLabel} en SophIA CRM.`,
    '',
    `Cita: ${appointment.title}`,
    typeLine ?? '',
    dateLine,
    locationLine ?? '',
    notesLine ?? '',
    '',
    closing,
  ]
    .filter(Boolean)
    .join('\n')

  return {
    subject,
    body,
    html: buildHtmlEmail({
      recipientName: recipient.name,
      eventLabel,
      title: appointment.title,
      dateLine,
      typeLine,
      locationLine,
      notesLine,
      closing,
      isStaff: recipient.type === 'staff',
    }),
    ics: buildIcs(appointment, eventType, settings.default_duration_minutes),
  }
}

function buildHtmlEmail({
  recipientName,
  eventLabel,
  title,
  dateLine,
  typeLine,
  locationLine,
  notesLine,
  closing,
  isStaff,
}: {
  recipientName: string
  eventLabel: string
  title: string
  dateLine: string
  typeLine: string | null
  locationLine: string | null
  notesLine: string | null
  closing: string
  isStaff: boolean
}) {
  const rows = [
    ['Cita', title],
    typeLine ? splitDetailLine(typeLine) : null,
    splitDetailLine(dateLine),
    locationLine ? splitDetailLine(locationLine) : null,
    notesLine ? splitDetailLine(notesLine) : null,
  ].filter(Boolean) as Array<[string, string]>

  const appUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  const cta = isStaff && appUrl
    ? `<a href="${escapeHtml(appUrl)}/appointments" style="display:inline-block;border-radius:8px;background:#534AB7;color:#ffffff;font-weight:700;text-decoration:none;padding:12px 18px;">Ver en SophIA CRM</a>`
    : ''

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(eventLabel)}</title>
  </head>
  <body style="margin:0;background:#0E0B2E;color:#ffffff;font-family:Arial,Helvetica,sans-serif;">
    <div style="padding:28px 16px;">
      <div style="max-width:620px;margin:0 auto;background:#151132;border:1px solid rgba(127,119,221,0.28);border-radius:14px;overflow:hidden;">
        <div style="padding:22px 24px;border-bottom:1px solid rgba(127,119,221,0.22);">
          <div style="font-size:18px;font-weight:800;letter-spacing:-0.2px;color:#ffffff;">Soph<span style="color:#0ABFAD;">IA</span> CRM</div>
          <div style="margin-top:6px;font-size:13px;color:#B8B3F0;">${escapeHtml(eventLabel)}</div>
        </div>
        <div style="padding:24px;">
          <p style="margin:0 0 16px;font-size:16px;line-height:1.5;color:#ffffff;">Hola ${escapeHtml(recipientName)},</p>
          <p style="margin:0 0 22px;font-size:15px;line-height:1.6;color:#AEACC4;">${escapeHtml(closing)}</p>
          <table role="presentation" style="width:100%;border-collapse:collapse;background:#0E0B2E;border-radius:10px;overflow:hidden;">
            ${rows
              .map(
                ([label, value]) => `<tr>
                  <td style="padding:13px 14px;border-bottom:1px solid rgba(127,119,221,0.16);width:34%;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;color:#B8B3F0;">${escapeHtml(label)}</td>
                  <td style="padding:13px 14px;border-bottom:1px solid rgba(127,119,221,0.16);font-size:14px;line-height:1.5;color:#ffffff;">${escapeHtml(value)}</td>
                </tr>`,
              )
              .join('')}
          </table>
          ${cta ? `<div style="margin-top:24px;">${cta}</div>` : ''}
        </div>
        <div style="padding:16px 24px;background:#1C1844;font-size:12px;line-height:1.5;color:#AEACC4;">
          Este mensaje fue generado automaticamente por SophIA CRM.
        </div>
      </div>
    </div>
  </body>
</html>`
}

function splitDetailLine(value: string): [string, string] {
  const index = value.indexOf(':')
  if (index === -1) return ['Detalle', value]
  return [value.slice(0, index), value.slice(index + 1).trim()]
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function buildIcs(
  appointment: AppointmentNotificationRow,
  eventType: AppointmentNotificationEvent,
  defaultDurationMinutes = DEFAULT_APPOINTMENT_DURATION_MINUTES,
) {
  if (!appointment.scheduled_start) return null

  const start = new Date(appointment.scheduled_start)
  if (Number.isNaN(start.getTime())) return null

  const end = appointment.scheduled_end
    ? new Date(appointment.scheduled_end)
    : new Date(start.getTime() + defaultDurationMinutes * 60_000)

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

function formatDate(
  value: string,
  timezone?: string | null,
  fallbackTimezone = DEFAULT_APPOINTMENT_TIMEZONE,
) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  try {
    return new Intl.DateTimeFormat('es-419', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: timezone || fallbackTimezone,
    }).format(date)
  } catch {
    return new Intl.DateTimeFormat('es-419', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date)
  }
}
