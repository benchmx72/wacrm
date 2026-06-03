import nodemailer from 'nodemailer'

type SendSmtpEmailInput = {
  to: string
  subject: string
  text: string
  html?: string | null
  icsContent?: string | null
}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is not configured`)
  return value
}

function smtpPort() {
  const raw = process.env.SMTP_PORT?.trim()
  if (!raw) return 587
  const port = Number(raw)
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error('SMTP_PORT must be a valid positive number')
  }
  return port
}

function smtpSecure(port: number) {
  const raw = process.env.SMTP_SECURE?.trim().toLowerCase()
  if (raw === 'true') return true
  if (raw === 'false') return false
  return port === 465
}

function smtpRejectUnauthorized() {
  const raw = process.env.SMTP_TLS_REJECT_UNAUTHORIZED?.trim().toLowerCase()
  if (raw === 'false') return false
  return true
}

export function isSmtpConfigured() {
  return Boolean(
    process.env.SMTP_HOST?.trim() &&
      process.env.SMTP_USER?.trim() &&
      process.env.SMTP_PASS?.trim() &&
      process.env.SMTP_FROM?.trim(),
  )
}

export async function sendSmtpEmail({
  to,
  subject,
  text,
  html,
  icsContent,
}: SendSmtpEmailInput) {
  const port = smtpPort()
  const transporter = nodemailer.createTransport({
    host: requiredEnv('SMTP_HOST'),
    port,
    secure: smtpSecure(port),
    auth: {
      user: requiredEnv('SMTP_USER'),
      pass: requiredEnv('SMTP_PASS'),
    },
    tls: {
      rejectUnauthorized: smtpRejectUnauthorized(),
    },
  })

  return transporter.sendMail({
    from: process.env.SMTP_FROM_NAME
      ? `"${process.env.SMTP_FROM_NAME}" <${requiredEnv('SMTP_FROM')}>`
      : requiredEnv('SMTP_FROM'),
    to,
    subject,
    text,
    html: html ?? undefined,
    attachments: icsContent
      ? [
          {
            filename: 'cita.ics',
            content: icsContent,
            contentType: `text/calendar; charset=utf-8; method=${calendarMethod(icsContent)}`,
          },
        ]
      : undefined,
  })
}

function calendarMethod(icsContent: string) {
  return icsContent.includes('METHOD:CANCEL') ? 'CANCEL' : 'REQUEST'
}
