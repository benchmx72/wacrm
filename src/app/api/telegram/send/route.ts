import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServerAccountOwnerId } from '@/lib/auth/account';
import { supabaseAuthAdmin } from '@/lib/auth/admin-client';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { decrypt } from '@/lib/whatsapp/encryption';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';

function telegramChatIdFromContact(phone: string | null | undefined) {
  const match = /^tg:(-?\d+)$/.exec(phone ?? '');
  return match?.[1] ?? null;
}

function telegramReplyIdFromMessageId(messageId: string | null | undefined) {
  const match = /^telegram:-?\d+:(\d+)$/.exec(messageId ?? '');
  return match ? Number(match[1]) : undefined;
}

async function sendTelegramText(args: {
  botToken: string;
  chatId: string;
  text: string;
  replyToMessageId?: number;
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
  });

  const payload = await res.json().catch(() => null);
  if (!res.ok || !payload?.ok) {
    const message = payload?.description || `Telegram API respondio con HTTP ${res.status}`;
    throw new Error(message);
  }

  return payload.result as { message_id: number; date: number };
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const limit = checkRateLimit(`send:${user.id}`, RATE_LIMITS.send);
    if (!limit.success) {
      return rateLimitResponse(limit);
    }

    const accountOwnerId = await getServerAccountOwnerId(supabase, user.id);
    const body = await request.json();
    const { conversation_id, message_type, content_text, reply_to_message_id } = body;

    if (!conversation_id || !message_type) {
      return NextResponse.json(
        { error: 'conversation_id and message_type are required' },
        { status: 400 },
      );
    }

    if (message_type !== 'text') {
      return NextResponse.json(
        { error: 'Telegram solo soporta mensajes de texto por ahora.' },
        { status: 400 },
      );
    }

    if (!content_text?.trim()) {
      return NextResponse.json(
        { error: 'content_text is required for text messages' },
        { status: 400 },
      );
    }

    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('*, contact:contacts(*)')
      .eq('id', conversation_id)
      .eq('user_id', accountOwnerId)
      .single();

    if (convError || !conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    const contact = conversation.contact;
    const chatId = telegramChatIdFromContact(contact?.phone);
    if (!chatId) {
      return NextResponse.json(
        { error: 'Esta conversacion no pertenece a Telegram.' },
        { status: 400 },
      );
    }

    const admin = supabaseAuthAdmin();
    const { data: config, error: configError } = await admin
      .from('telegram_config')
      .select('bot_token, status')
      .eq('user_id', accountOwnerId)
      .eq('status', 'connected')
      .maybeSingle();

    if (configError || !config) {
      return NextResponse.json(
        { error: 'Telegram no esta configurado para esta cuenta.' },
        { status: 400 },
      );
    }

    let replyToTelegramMessageId: number | undefined;
    if (reply_to_message_id) {
      const { data: parent, error: parentError } = await supabase
        .from('messages')
        .select('message_id, conversation_id')
        .eq('id', reply_to_message_id)
        .eq('conversation_id', conversation_id)
        .maybeSingle();

      if (parentError || !parent) {
        return NextResponse.json(
          { error: 'reply_to_message_id not found in this conversation' },
          { status: 400 },
        );
      }
      replyToTelegramMessageId = telegramReplyIdFromMessageId(parent.message_id);
    }

    let telegramMessageId = '';
    try {
      const botToken = decrypt(config.bot_token);
      const sent = await sendTelegramText({
        botToken,
        chatId,
        text: content_text.trim(),
        replyToMessageId: replyToTelegramMessageId,
      });
      telegramMessageId = `telegram:${chatId}:${sent.message_id}`;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown Telegram API error';
      console.error('[telegram/send] Telegram API send failed:', message);
      return NextResponse.json(
        { error: `Telegram API error: ${message}` },
        { status: 502 },
      );
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
      .single();

    if (msgError) {
      console.error('[telegram/send] Error inserting sent message:', msgError);
      return NextResponse.json(
        { error: `Mensaje enviado a Telegram pero no se pudo guardar: ${msgError.message}` },
        { status: 500 },
      );
    }

    const sentAt = new Date().toISOString();

    await supabase
      .from('conversations')
      .update({
        last_message_text: content_text.trim(),
        last_message_at: sentAt,
        updated_at: sentAt,
      })
      .eq('id', conversation_id);

    const { error: aiPauseError } = await supabase
      .from('conversations')
      .update({
        ai_paused: true,
        ai_paused_at: sentAt,
        ai_paused_by: user.id,
        ai_pause_reason: 'human_reply',
      })
      .eq('id', conversation_id);

    if (aiPauseError) {
      console.warn('[telegram/send] AI pause skipped:', aiPauseError.message);
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
        .eq('status', 'active');
    } catch (err) {
      console.error(
        '[telegram/send] pause-on-agent-send threw:',
        err instanceof Error ? err.message : err,
      );
    }

    return NextResponse.json({
      success: true,
      message_id: messageRecord.id,
      telegram_message_id: telegramMessageId,
    });
  } catch (error) {
    console.error('Error in Telegram send POST:', error);
    return NextResponse.json(
      { error: 'Failed to send Telegram message' },
      { status: 500 },
    );
  }
}
