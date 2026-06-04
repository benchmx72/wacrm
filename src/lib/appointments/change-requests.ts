import type { SupabaseClient } from '@supabase/supabase-js'

export type AppointmentChangeRequestType = 'cancel' | 'reschedule'

type CaptureInput = {
  supabase: SupabaseClient
  accountOwnerId: string
  contactId: string
  conversationId: string
  customerText: string
  source: string
}

export async function captureAppointmentChangeRequest(input: CaptureInput) {
  const detected = detectAppointmentChangeRequest(input.customerText)
  if (!detected) return null

  const { data: appointment, error: appointmentError } = await input.supabase
    .from('appointments')
    .select('id, title, status, scheduled_start')
    .eq('user_id', input.accountOwnerId)
    .eq('contact_id', input.contactId)
    .in('status', ['proposed', 'confirmed'])
    .order('scheduled_start', { ascending: true, nullsFirst: false })
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (appointmentError) {
    console.error('[appointments/change-request] appointment lookup failed:', appointmentError.message)
    return null
  }
  if (!appointment) return null

  const payload = {
    requested_text: input.customerText.trim(),
    requested_time: detected.requestedTime,
    conversation_id: input.conversationId,
    source: input.source,
    metadata: {
      appointment_status_at_request: appointment.status,
      detected_at: new Date().toISOString(),
    },
  }

  const { data: existing, error: existingError } = await input.supabase
    .from('appointment_change_requests')
    .select('id')
    .eq('appointment_id', appointment.id)
    .eq('request_type', detected.type)
    .eq('status', 'pending')
    .maybeSingle()

  if (existingError) {
    console.error('[appointments/change-request] pending lookup failed:', existingError.message)
    return null
  }

  const query = existing?.id
    ? input.supabase
        .from('appointment_change_requests')
        .update(payload)
        .eq('id', existing.id)
    : input.supabase.from('appointment_change_requests').insert({
        user_id: input.accountOwnerId,
        appointment_id: appointment.id,
        contact_id: input.contactId,
        request_type: detected.type,
        status: 'pending',
        ...payload,
      })

  const { data: request, error } = await query
    .select('id, request_type, requested_text, requested_time, status')
    .single()

  if (error) {
    console.error('[appointments/change-request] save failed:', error.message)
    return null
  }

  return {
    ...request,
    appointmentId: appointment.id as string,
    appointmentTitle: appointment.title as string,
  }
}

export function appointmentChangeRequestInstructions(
  request: Awaited<ReturnType<typeof captureAppointmentChangeRequest>>,
) {
  if (!request) return ''

  const action =
    request.request_type === 'cancel'
      ? 'cancel the appointment'
      : 'reschedule the appointment'

  return [
    'Appointment change request captured by the CRM:',
    `- The customer asked to ${action}: ${request.appointmentTitle}.`,
    '- The request is pending staff approval. The appointment has NOT been changed yet.',
    '- Briefly acknowledge the request and clearly say that the team will review and confirm it.',
    '- Do not claim the appointment was cancelled or rescheduled.',
  ].join('\n')
}

function detectAppointmentChangeRequest(text: string): {
  type: AppointmentChangeRequestType
  requestedTime: string | null
} | null {
  const normalized = normalize(text)
  const appointmentWord =
    /\b(cita|consulta|reunion|turno|agendamento|compromisso|horario)\b/
  const cancellation =
    /\b(cancelar|cancela|cancele|cancelamento|anular|desmarcar|nao posso ir|nao vou poder ir|no puedo ir|no puedo asistir)\b/
  const reschedule =
    /\b(reprogramar|reprograma|remarcar|mover|cambiar|cambio|alterar|trocar|outra data|otro horario|otra fecha)\b/

  if (cancellation.test(normalized) && appointmentWord.test(normalized)) {
    return { type: 'cancel', requestedTime: null }
  }

  if (reschedule.test(normalized) && appointmentWord.test(normalized)) {
    return { type: 'reschedule', requestedTime: text.trim() }
  }

  return null
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
}
