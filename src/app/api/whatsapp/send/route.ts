import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendTextMessage, sendTemplateMessage } from '@/lib/whatsapp/meta-api'
import { decrypt, encrypt, isLegacyFormat } from '@/lib/whatsapp/encryption'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { supabaseAuthAdmin } from '@/lib/auth/admin-client'
import {
  sanitizePhoneForMeta,
  isValidE164,
  phoneVariants,
  isRecipientNotAllowedError,
} from '@/lib/whatsapp/phone-utils'
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit'
import { getServerAccountOwnerId } from '@/lib/auth/account'

function telegramChatIdFromContact(phone: string | null | undefined) {
  const match = /^tg:(-?\d+)$/.exec(phone ?? '')
  return match?.[1] ?? null
}

function telegramReplyIdFromMessageId(messageId: string | null | undefined) {
  const match = /^telegram:-?\d+:(\d+)$/.exec(messageId ?? '')
  return match ? Number(match[1]) : undefined
}

async function sendTelegramText(args: {
  botToken: string
  chatId: string
  text: string
  replyToMessageId?: number
}) {
  const res = await fetch(`https://api.telegram.org/bot${args.botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: args.chatId,
      text: args.text,
      ...(args.replyToMessageId
        ? { reply_parameters: { message_id: args.replyToMessageId } }
        : {}),
    }),
  })

  const payload = await res.json().catch(() => null)
  if (!res.ok || !payload?.ok) {
    const message = payload?.description || `Telegram API respondio con HTTP ${res.status}`
    throw new Error(message)
  }

  return payload.result as { message_id: number; date: number }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }
    const accountOwnerId = await getServerAccountOwnerId(supabase, user.id)

    // Per-user rate limit. Bucket key is scoped to this route so
    // `/broadcast` has an independent budget.
    const limit = checkRateLimit(`send:${user.id}`, RATE_LIMITS.send)
    if (!limit.success) {
      return rateLimitResponse(limit)
    }

    const body = await request.json()
    const {
      conversation_id,
      message_type,
      content_text,
      media_url,
      template_name,
      template_params,
      reply_to_message_id,
    } = body

    if (!conversation_id || !message_type) {
      return NextResponse.json(
        { error: 'conversation_id and message_type are required' },
        { status: 400 }
      )
    }

    if (message_type === 'text' && !content_text) {
      return NextResponse.json(
        { error: 'content_text is required for text messages' },
        { status: 400 }
      )
    }

    if (message_type === 'template' && !template_name) {
      return NextResponse.json(
        { error: 'template_name is required for template messages' },
        { status: 400 }
      )
    }

    // Fetch conversation and contact
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('*, contact:contacts(*)')
      .eq('id', conversation_id)
      .eq('user_id', accountOwnerId)
      .single()

    if (convError || !conversation) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      )
    }

    const contact = conversation.contact
    if (!contact?.phone) {
      return NextResponse.json(
        { error: 'Contact phone number not found' },
        { status: 400 }
      )
    }

    const telegramChatId = telegramChatIdFromContact(contact.phone)
    if (telegramChatId) {
      if (message_type !== 'text') {
        return NextResponse.json(
          { error: 'Telegram solo soporta mensajes de texto por ahora.' },
          { status: 400 }
        )
      }

      let replyToTelegramMessageId: number | undefined
      if (reply_to_message_id) {
        const { data: parent, error: parentError } = await supabase
          .from('messages')
          .select('message_id, conversation_id')
          .eq('id', reply_to_message_id)
          .eq('conversation_id', conversation_id)
          .maybeSingle()

        if (parentError || !parent) {
          return NextResponse.json(
            { error: 'reply_to_message_id not found in this conversation' },
            { status: 400 }
          )
        }
        replyToTelegramMessageId = telegramReplyIdFromMessageId(parent.message_id)
      }

      const admin = supabaseAuthAdmin()
      const { data: telegramConfig, error: telegramConfigError } = await admin
        .from('telegram_config')
        .select('bot_token, status')
        .eq('user_id', accountOwnerId)
        .eq('status', 'connected')
        .maybeSingle()

      if (telegramConfigError || !telegramConfig) {
        return NextResponse.json(
          { error: 'Telegram no esta configurado para esta cuenta.' },
          { status: 400 }
        )
      }

      let telegramMessageId = ''
      try {
        const sent = await sendTelegramText({
          botToken: decrypt(telegramConfig.bot_token),
          chatId: telegramChatId,
          text: content_text.trim(),
          replyToMessageId: replyToTelegramMessageId,
        })
        telegramMessageId = `telegram:${telegramChatId}:${sent.message_id}`
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown Telegram API error'
        console.error('[whatsapp/send -> telegram] Telegram API send failed:', message)
        return NextResponse.json(
          { error: `Telegram API error: ${message}` },
          { status: 502 }
        )
      }

      const { data: messageRecord, error: msgError } = await supabase
        .from('messages')
        .insert({
          conversation_id,
          sender_type: 'agent',
          content_type: 'text',
          content_text: content_text.trim(),
          message_id: telegramMessageId,
          status: 'sent',
          reply_to_message_id: reply_to_message_id || null,
        })
        .select()
        .single()

      if (msgError) {
        console.error('[whatsapp/send -> telegram] Error inserting sent message:', msgError)
        return NextResponse.json(
          { error: `Mensaje enviado a Telegram pero no se pudo guardar: ${msgError.message}` },
          { status: 500 }
        )
      }

      const sentAt = new Date().toISOString()

      await supabase
        .from('conversations')
        .update({
          last_message_text: content_text.trim(),
          last_message_at: sentAt,
          updated_at: sentAt,
        })
        .eq('id', conversation_id)

      const { error: aiPauseError } = await supabase
        .from('conversations')
        .update({
          ai_paused: true,
          ai_paused_at: sentAt,
          ai_paused_by: user.id,
          ai_pause_reason: 'human_reply',
        })
        .eq('id', conversation_id)

      if (aiPauseError) {
        console.warn('[whatsapp/send -> telegram] AI pause skipped:', aiPauseError.message)
      }

      try {
        await supabaseAdmin()
          .from('flow_runs')
          .update({
            status: 'paused_by_agent',
            ended_at: new Date().toISOString(),
            end_reason: 'agent_replied',
          })
          .eq('user_id', accountOwnerId)
          .eq('contact_id', contact.id)
          .eq('status', 'active')
      } catch (err) {
        console.error(
          '[whatsapp/send -> telegram] pause-on-agent-send threw:',
          err instanceof Error ? err.message : err,
        )
      }

      return NextResponse.json({
        success: true,
        message_id: messageRecord.id,
        telegram_message_id: telegramMessageId,
      })
    }

    // Sanitize and validate phone
    const sanitizedPhone = sanitizePhoneForMeta(contact.phone)
    if (!isValidE164(sanitizedPhone)) {
      return NextResponse.json(
        { error: 'Invalid phone number format' },
        { status: 400 }
      )
    }

    // Fetch and decrypt WhatsApp config
    const { data: config, error: configError } = await supabase
      .from('whatsapp_config')
      .select('*')
      .eq('user_id', accountOwnerId)
      .single()

    if (configError || !config) {
      return NextResponse.json(
        { error: 'WhatsApp not configured. Please set up your WhatsApp integration first.' },
        { status: 400 }
      )
    }

    const accessToken = decrypt(config.access_token)

    // Self-heal legacy CBC-encrypted tokens. Fire-and-forget: we
    // return from the send without waiting, so a failed upgrade just
    // means the next send tries again. The upgrade is idempotent —
    // concurrent sends both produce valid GCM ciphertexts of the same
    // plaintext, last write wins.
    if (isLegacyFormat(config.access_token)) {
      void supabase
        .from('whatsapp_config')
        .update({ access_token: encrypt(accessToken) })
        .eq('id', config.id)
        .then(({ error }) => {
          if (error) {
            console.warn(
              '[whatsapp/send] access_token GCM upgrade failed:',
              error.message,
            )
          }
        })
    }

    // Resolve the reply target (if any) to its Meta message_id, which is
    // what `context.message_id` on the outgoing Meta payload needs. The
    // parent must belong to this same conversation — otherwise a caller
    // could quote messages they can't see by guessing UUIDs.
    let contextMessageId: string | undefined
    if (reply_to_message_id) {
      const { data: parent, error: parentError } = await supabase
        .from('messages')
        .select('message_id, conversation_id')
        .eq('id', reply_to_message_id)
        .eq('conversation_id', conversation_id)
        .maybeSingle()

      if (parentError || !parent) {
        return NextResponse.json(
          { error: 'reply_to_message_id not found in this conversation' },
          { status: 400 }
        )
      }
      if (!parent.message_id) {
        // Parent never reached Meta (still in 'sending' or 'failed') — we
        // can't quote it on WhatsApp. Send without context rather than
        // dropping the message entirely.
        console.warn(
          '[whatsapp/send] reply target has no Meta message_id; sending without context'
        )
      } else {
        contextMessageId = parent.message_id
      }
    }

    // Send via Meta API — retry with phone-number variants if Meta rejects
    // with "recipient not in allowed list" (common in sandbox / when a
    // number was registered with/without a trunk 0). If an alternate
    // format succeeds, we persist it back to the contact row so the
    // next send goes through on the first attempt.
    let waMessageId = ''
    let workingPhone = sanitizedPhone

    const attempt = async (phone: string): Promise<string> => {
      if (message_type === 'template') {
        const result = await sendTemplateMessage({
          phoneNumberId: config.phone_number_id,
          accessToken,
          to: phone,
          templateName: template_name,
          params: template_params || [],
          contextMessageId,
        })
        return result.messageId
      }
      const result = await sendTextMessage({
        phoneNumberId: config.phone_number_id,
        accessToken,
        to: phone,
        text: content_text,
        contextMessageId,
      })
      return result.messageId
    }

    try {
      const variants = phoneVariants(sanitizedPhone)
      let lastError: unknown = null

      for (const variant of variants) {
        try {
          waMessageId = await attempt(variant)
          workingPhone = variant
          lastError = null
          break
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          // Only retry when the failure is specifically that the
          // recipient isn't in Meta's allowed list. Any other error
          // (bad token, invalid template, etc.) bubbles up immediately.
          if (!isRecipientNotAllowedError(message)) {
            throw err
          }
          lastError = err
          console.warn(`[whatsapp/send] variant "${variant}" rejected by Meta, trying next…`)
        }
      }

      if (lastError) throw lastError
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown Meta API error'
      console.error('Meta API send failed for all variants:', message)
      return NextResponse.json(
        { error: `Meta API error: ${message}` },
        { status: 502 }
      )
    }

    // If a non-original variant succeeded, update the contact so future
    // sends go straight through. sanitizePhoneForMeta on workingPhone
    // will yield workingPhone itself, so re-storing preserves it.
    if (workingPhone !== sanitizedPhone) {
      console.log(
        `[whatsapp/send] Auto-corrected contact phone: ${sanitizedPhone} → ${workingPhone}`
      )
      await supabase
        .from('contacts')
        .update({ phone: workingPhone })
        .eq('id', contact.id)
    }

    // Insert message into DB — field names MUST match the messages schema
    // (see supabase/migrations/001_initial_schema.sql):
    //   conversation_id, sender_type, content_type, content_text,
    //   media_url, template_name, message_id, status, created_at
    const { data: messageRecord, error: msgError } = await supabase
      .from('messages')
      .insert({
        conversation_id,
        sender_type: 'agent',
        content_type: message_type,
        content_text: content_text || null,
        media_url: media_url || null,
        template_name: template_name || null,
        message_id: waMessageId,
        status: 'sent',
        reply_to_message_id: reply_to_message_id || null,
      })
      .select()
      .single()

    if (msgError) {
      console.error('Error inserting sent message:', msgError)
      return NextResponse.json(
        { error: `Message sent to Meta but failed to save to DB: ${msgError.message}` },
        { status: 500 }
      )
    }

    // Update conversation
    const sentAt = new Date().toISOString()

    await supabase
      .from('conversations')
      .update({
        last_message_text: content_text || `[${message_type}]`,
        last_message_at: sentAt,
        updated_at: sentAt,
      })
      .eq('id', conversation_id)

    const { error: aiPauseError } = await supabase
      .from('conversations')
      .update({
        ai_paused: true,
        ai_paused_at: sentAt,
        ai_paused_by: user.id,
        ai_pause_reason: 'human_reply',
      })
      .eq('id', conversation_id)

    if (aiPauseError) {
      console.warn('[whatsapp/send] AI pause skipped:', aiPauseError.message)
    }

    // Pause any active Flow run for this contact — the agent stepping
    // in is the strongest "yield, human is here" signal. See PR #2
    // plan for why we pause (not end): preserves diagnostic state +
    // lets the agent or the 24h timeout sweep cleanly resolve the
    // run later. For accounts with no active runs the UPDATE matches
    // zero rows — cheap and harmless.
    try {
      const { error: pauseErr } = await supabaseAdmin()
        .from('flow_runs')
        .update({
          status: 'paused_by_agent',
          ended_at: new Date().toISOString(),
          end_reason: 'agent_replied',
        })
        .eq('user_id', accountOwnerId)
        .eq('contact_id', contact.id)
        .eq('status', 'active')
      if (pauseErr) {
        // Best-effort — log + continue. The agent's message already
        // landed at Meta; don't fail the response over a bookkeeping
        // miss. Worst case: a stale active run gets caught by the
        // stale-run cron sweep within 24h.
        console.error('[flows] pause-on-agent-send failed:', pauseErr.message)
      }
    } catch (err) {
      console.error(
        '[flows] pause-on-agent-send threw:',
        err instanceof Error ? err.message : err,
      )
    }

    return NextResponse.json({
      success: true,
      message_id: messageRecord.id,
      whatsapp_message_id: waMessageId,
    })
  } catch (error) {
    console.error('Error in WhatsApp send POST:', error)
    return NextResponse.json(
      { error: 'Failed to send message' },
      { status: 500 }
    )
  }
}
