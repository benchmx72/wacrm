import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServerAccountOwnerId } from '@/lib/auth/account';
import { supabaseAuthAdmin } from '@/lib/auth/admin-client';
import { decrypt } from '@/lib/whatsapp/encryption';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';

const SEND_BATCH_DELAY_MS = 500;

interface ContactRow {
  id: string;
  phone: string;
  name?: string | null;
}

interface ConversationRow {
  id: string;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function telegramChatIdFromContact(phone: string | null | undefined) {
  const match = /^tg:(-?\d+)$/.exec(phone ?? '');
  return match?.[1] ?? null;
}

async function sendTelegramText(args: {
  botToken: string;
  chatId: string;
  text: string;
}) {
  const res = await fetch(`https://api.telegram.org/bot${args.botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: args.chatId,
      text: args.text,
    }),
  });

  const payload = await res.json().catch(() => null);
  if (!res.ok || !payload?.ok) {
    const message = payload?.description || `Telegram API respondio con HTTP ${res.status}`;
    throw new Error(message);
  }

  return payload.result as { message_id: number; date: number };
}

async function findOrCreateConversation(
  userId: string,
  contactId: string,
): Promise<ConversationRow> {
  const admin = supabaseAuthAdmin();
  const { data: existing, error: findError } = await admin
    .from('conversations')
    .select('id')
    .eq('user_id', userId)
    .eq('contact_id', contactId)
    .maybeSingle();

  if (findError) {
    throw new Error(`No se pudo buscar la conversacion: ${findError.message}`);
  }
  if (existing) return existing as ConversationRow;

  const { data: created, error: createError } = await admin
    .from('conversations')
    .insert({
      user_id: userId,
      contact_id: contactId,
    })
    .select('id')
    .single();

  if (createError || !created) {
    throw new Error(`No se pudo crear la conversacion: ${createError?.message ?? 'error desconocido'}`);
  }

  return created as ConversationRow;
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

    const limit = checkRateLimit(`telegram-broadcast:${user.id}`, RATE_LIMITS.send);
    if (!limit.success) return rateLimitResponse(limit);

    const accountOwnerId = await getServerAccountOwnerId(supabase, user.id);
    const body = await request.json();
    const broadcastId = String(body.broadcast_id ?? '');
    const messageText = String(body.message_text ?? '').trim();

    if (!broadcastId || !messageText) {
      return NextResponse.json(
        { error: 'broadcast_id and message_text are required' },
        { status: 400 },
      );
    }

    const admin = supabaseAuthAdmin();

    const { data: broadcast, error: broadcastError } = await admin
      .from('broadcasts')
      .select('id, user_id')
      .eq('id', broadcastId)
      .eq('user_id', accountOwnerId)
      .single();

    if (broadcastError || !broadcast) {
      return NextResponse.json({ error: 'Broadcast not found' }, { status: 404 });
    }

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

    const { data: recipients, error: recipientsError } = await admin
      .from('broadcast_recipients')
      .select('id, contact:contacts(id, phone, name)')
      .eq('broadcast_id', broadcastId)
      .eq('status', 'pending');

    if (recipientsError) {
      return NextResponse.json(
        { error: `No se pudieron leer destinatarios: ${recipientsError.message}` },
        { status: 500 },
      );
    }

    const botToken = decrypt(config.bot_token);
    let sentCount = 0;
    let failedCount = 0;

    for (const recipient of recipients ?? []) {
      const rawContact = recipient.contact as ContactRow | ContactRow[] | null;
      const contact = Array.isArray(rawContact) ? rawContact[0] : rawContact;
      const chatId = telegramChatIdFromContact(contact?.phone);
      const recipientId = recipient.id as string;

      if (!contact || !chatId) {
        failedCount++;
        await admin
          .from('broadcast_recipients')
          .update({
            status: 'failed',
            error_message: 'El contacto no tiene ID de Telegram valido.',
          })
          .eq('id', recipientId);
        continue;
      }

      try {
        const sent = await sendTelegramText({
          botToken,
          chatId,
          text: messageText,
        });
        const createdAt = new Date(sent.date * 1000).toISOString();
        const conversation = await findOrCreateConversation(accountOwnerId, contact.id);
        const telegramMessageId = `telegram:${chatId}:${sent.message_id}`;

        await admin.from('messages').insert({
          conversation_id: conversation.id,
          sender_type: 'agent',
          content_type: 'text',
          content_text: messageText,
          message_id: telegramMessageId,
          status: 'sent',
          created_at: createdAt,
        });

        await admin
          .from('conversations')
          .update({
            last_message_text: messageText,
            last_message_at: createdAt,
            updated_at: new Date().toISOString(),
          })
          .eq('id', conversation.id);

        sentCount++;
        await admin
          .from('broadcast_recipients')
          .update({
            status: 'sent',
            sent_at: createdAt,
            whatsapp_message_id: telegramMessageId,
            error_message: null,
          })
          .eq('id', recipientId);
      } catch (err) {
        failedCount++;
        await admin
          .from('broadcast_recipients')
          .update({
            status: 'failed',
            error_message: err instanceof Error ? err.message : 'Error desconocido',
          })
          .eq('id', recipientId);
      }

      await sleep(SEND_BATCH_DELAY_MS);
    }

    const finalStatus = sentCount > 0 ? 'sent' : 'failed';
    await admin
      .from('broadcasts')
      .update({
        status: finalStatus,
        sent_count: sentCount,
        failed_count: failedCount,
      })
      .eq('id', broadcastId);

    return NextResponse.json({
      success: true,
      sent_count: sentCount,
      failed_count: failedCount,
    });
  } catch (error) {
    console.error('[telegram/broadcast] failed:', error);
    return NextResponse.json(
      { error: 'Failed to send Telegram broadcast' },
      { status: 500 },
    );
  }
}
