import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { queueDueAppointmentReminders } from '@/lib/appointments/notifications'
import { isSmtpConfigured, sendSmtpEmail } from '@/lib/email/smtp'
import { sendTelegramText, telegramChatIdFromContact } from '@/lib/telegram/send'
import { decrypt } from '@/lib/whatsapp/encryption'

export const runtime = 'nodejs'
const WORKER_VERSION = 'notifications-worker-2026-06-03-1'

type NotificationRow = {
  id: string
  user_id: string
  contact_id: string | null
  channel: 'email' | 'telegram' | 'whatsapp'
  recipient_email: string | null
  subject: string
  body_text: string
  ics_content: string | null
  metadata: Record<string, unknown> | null
}

function authorize(request: Request) {
  const expected = (
    process.env.APPOINTMENT_NOTIFICATIONS_SECRET ??
    process.env.AUTOMATION_CRON_SECRET
  )?.trim()

  if (!expected) return { ok: false, status: 503, error: 'worker not configured' }

  const url = new URL(request.url)
  const supplied =
    request.headers.get('x-cron-secret')?.trim() ||
    url.searchParams.get('secret')?.trim() ||
    url.searchParams.get('cron_secret')?.trim() ||
    url.searchParams.get('key')?.trim() ||
    ''

  const suppliedBuf = Buffer.from(supplied)
  const expectedBuf = Buffer.from(expected)
  const matches =
    suppliedBuf.length === expectedBuf.length &&
    timingSafeEqual(suppliedBuf, expectedBuf)

  return matches
    ? { ok: true as const }
    : { ok: false, status: 401, error: 'Unauthorized' }
}

function jsonResponse(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init)
  response.headers.set('x-sophia-worker-version', WORKER_VERSION)
  return response
}

export async function GET(request: Request) {
  const auth = authorize(request)
  if (!auth.ok) {
    return jsonResponse({ error: auth.error }, { status: auth.status })
  }

  const limit = Math.min(
    Math.max(Number(new URL(request.url).searchParams.get('limit') ?? 25), 1),
    100,
  )
  const admin = supabaseAdmin()
  let remindersQueued = 0
  try {
    remindersQueued = await queueDueAppointmentReminders(admin)
  } catch (error) {
    console.error('[appointments-reminders] queue failed:', error)
  }

  const { data, error } = await admin
    .from('appointment_notifications')
    .select('id, user_id, contact_id, channel, recipient_email, subject, body_text, ics_content, metadata')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(limit)

  if (error) return jsonResponse({ error: error.message }, { status: 500 })
  const rows = (data ?? []) as NotificationRow[]
  if (rows.length === 0) {
    return jsonResponse({ reminders_queued: remindersQueued, processed: 0, sent: 0, failed: 0 })
  }

  let sent = 0
  let failed = 0
  let skipped = 0

  for (const row of rows) {
    const { data: claim, error: claimError } = await admin
      .from('appointment_notifications')
      .update({ status: 'sending', error_message: null })
      .eq('id', row.id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle()

    if (claimError) {
      failed += 1
      console.error('[appointments-email] claim failed:', claimError.message)
      continue
    }
    if (!claim) {
      skipped += 1
      continue
    }

    try {
      const result =
        row.channel === 'telegram'
          ? await deliverTelegramReminder(admin, row)
          : await deliverEmailReminder(row)

      await admin
        .from('appointment_notifications')
        .update({
          status: 'sent',
          error_message: null,
          metadata: {
            ...(row.metadata ?? {}),
            sent_at: new Date().toISOString(),
            delivery_message_id: result.messageId ?? null,
          },
        })
        .eq('id', row.id)

      sent += 1
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await admin
        .from('appointment_notifications')
        .update({
          status: 'failed',
          error_message: message.slice(0, 500),
          metadata: {
            ...(row.metadata ?? {}),
            failed_at: new Date().toISOString(),
          },
        })
        .eq('id', row.id)

      failed += 1
    }
  }

  return jsonResponse({
    reminders_queued: remindersQueued,
    processed: rows.length,
    sent,
    failed,
    skipped,
  })
}

export async function POST(request: Request) {
  return GET(request)
}

async function deliverEmailReminder(row: NotificationRow) {
  if (!isSmtpConfigured()) throw new Error('SMTP not configured')
  if (!row.recipient_email) throw new Error('Recipient email missing')

  const result = await sendSmtpEmail({
    to: row.recipient_email,
    subject: row.subject,
    text: row.body_text,
    html:
      typeof row.metadata?.html_body === 'string'
        ? row.metadata.html_body
        : null,
    icsContent: row.ics_content,
  })

  return { messageId: result.messageId ?? null }
}

async function deliverTelegramReminder(
  admin: ReturnType<typeof supabaseAdmin>,
  row: NotificationRow,
) {
  if (!row.contact_id) throw new Error('Telegram reminder contact missing')

  const [{ data: contact, error: contactError }, { data: config, error: configError }] =
    await Promise.all([
      admin
        .from('contacts')
        .select('id, phone')
        .eq('id', row.contact_id)
        .eq('user_id', row.user_id)
        .single(),
      admin
        .from('telegram_config')
        .select('bot_token, status')
        .eq('user_id', row.user_id)
        .eq('status', 'connected')
        .maybeSingle(),
    ])

  if (contactError || !contact) throw new Error('Telegram contact not found')
  if (configError || !config) throw new Error('Telegram is not connected')

  const chatId = telegramChatIdFromContact(contact.phone)
  if (!chatId) throw new Error('Telegram chat ID missing')

  const sent = await sendTelegramText({
    botToken: decrypt(config.bot_token),
    chatId,
    text: row.body_text,
  })
  const createdAt = new Date(sent.date * 1000).toISOString()

  let { data: conversation } = await admin
    .from('conversations')
    .select('id')
    .eq('user_id', row.user_id)
    .eq('contact_id', row.contact_id)
    .maybeSingle()

  if (!conversation) {
    const { data: created, error } = await admin
      .from('conversations')
      .insert({ user_id: row.user_id, contact_id: row.contact_id })
      .select('id')
      .single()
    if (error || !created) throw new Error(error?.message ?? 'Conversation create failed')
    conversation = created
  }

  const telegramMessageId = `telegram:${chatId}:${sent.message_id}`
  await admin.from('messages').insert({
    conversation_id: conversation.id,
    sender_type: 'agent',
    content_type: 'text',
    content_text: row.body_text,
    message_id: telegramMessageId,
    status: 'sent',
    created_at: createdAt,
  })
  await admin
    .from('conversations')
    .update({
      last_message_text: row.body_text,
      last_message_at: createdAt,
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversation.id)

  return { messageId: telegramMessageId }
}
