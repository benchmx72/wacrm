import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { isSmtpConfigured, sendSmtpEmail } from '@/lib/email/smtp'

export const runtime = 'nodejs'
const WORKER_VERSION = 'notifications-worker-2026-06-03-1'

type NotificationRow = {
  id: string
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

  if (!isSmtpConfigured()) {
    return jsonResponse({ error: 'SMTP not configured' }, { status: 503 })
  }

  const limit = Math.min(
    Math.max(Number(new URL(request.url).searchParams.get('limit') ?? 25), 1),
    100,
  )
  const admin = supabaseAdmin()
  const { data, error } = await admin
    .from('appointment_notifications')
    .select('id, recipient_email, subject, body_text, ics_content, metadata')
    .eq('status', 'pending')
    .not('recipient_email', 'is', null)
    .order('created_at', { ascending: true })
    .limit(limit)

  if (error) return jsonResponse({ error: error.message }, { status: 500 })
  const rows = (data ?? []) as NotificationRow[]
  if (rows.length === 0) return jsonResponse({ processed: 0, sent: 0, failed: 0 })

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
      if (!row.recipient_email) throw new Error('Recipient email missing')

      const result = await sendSmtpEmail({
        to: row.recipient_email,
        subject: row.subject,
        text: row.body_text,
        html: typeof row.metadata?.html_body === 'string' ? row.metadata.html_body : null,
        icsContent: row.ics_content,
      })

      await admin
        .from('appointment_notifications')
        .update({
          status: 'sent',
          error_message: null,
          metadata: {
            ...(row.metadata ?? {}),
            sent_at: new Date().toISOString(),
            smtp_message_id: result.messageId ?? null,
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
    processed: rows.length,
    sent,
    failed,
    skipped,
  })
}

export async function POST(request: Request) {
  return GET(request)
}
