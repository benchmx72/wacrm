import { NextResponse } from 'next/server';
import { supabaseAuthAdmin } from '@/lib/auth/admin-client';

interface TelegramUser {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

interface TelegramChat {
  id: number;
  type: string;
  first_name?: string;
  last_name?: string;
  username?: string;
  title?: string;
}

interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
  caption?: string;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
}

export async function POST(request: Request) {
  const update = (await request.json().catch(() => null)) as TelegramUpdate | null;
  console.log('[telegram/webhook] update received', update);

  if (!update) {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  processTelegramUpdate(update).catch((error) => {
    console.error('[telegram/webhook] processing failed:', error);
  });

  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    message: 'Telegram webhook endpoint ready',
  });
}

async function processTelegramUpdate(update: TelegramUpdate) {
  const message = update.message ?? update.edited_message;
  if (!message?.chat?.id) return;

  const admin = supabaseAuthAdmin();
  const { data: configs, error: configError } = await admin
    .from('telegram_config')
    .select('user_id, status')
    .eq('status', 'connected')
    .limit(1);

  if (configError) {
    console.error('[telegram/webhook] config lookup failed:', configError.message);
    return;
  }

  const config = configs?.[0];
  if (!config?.user_id) {
    console.warn('[telegram/webhook] no connected telegram_config found');
    return;
  }

  const userId = config.user_id as string;
  const contactIdentity = `tg:${message.chat.id}`;
  const contactName = getTelegramContactName(message);
  const contentText = getTelegramMessageText(message);
  const telegramMessageId = `telegram:${message.chat.id}:${message.message_id}`;

  const { data: existingMessage, error: existingMessageError } = await admin
    .from('messages')
    .select('id')
    .eq('message_id', telegramMessageId)
    .maybeSingle();

  if (existingMessageError) {
    console.error('[telegram/webhook] duplicate check failed:', existingMessageError.message);
    return;
  }
  if (existingMessage) return;

  const contact = await findOrCreateTelegramContact(
    userId,
    contactIdentity,
    contactName,
  );
  if (!contact) return;

  const conversation = await findOrCreateConversation(userId, contact.id);
  if (!conversation) return;

  const createdAt = new Date(message.date * 1000).toISOString();
  const { error: insertError } = await admin.from('messages').insert({
    conversation_id: conversation.id,
    sender_type: 'customer',
    content_type: 'text',
    content_text: contentText,
    message_id: telegramMessageId,
    status: 'delivered',
    created_at: createdAt,
  });

  if (insertError) {
    console.error('[telegram/webhook] message insert failed:', insertError.message);
    return;
  }

  const { error: updateError } = await admin
    .from('conversations')
    .update({
      last_message_text: contentText,
      last_message_at: createdAt,
      unread_count: (conversation.unread_count ?? 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversation.id);

  if (updateError) {
    console.error('[telegram/webhook] conversation update failed:', updateError.message);
  }
}

function getTelegramContactName(message: TelegramMessage) {
  const source = message.from ?? message.chat;
  const name = [source.first_name, source.last_name].filter(Boolean).join(' ').trim();
  return name || source.username || message.chat.title || `Telegram ${message.chat.id}`;
}

function getTelegramMessageText(message: TelegramMessage) {
  return message.text || message.caption || '[Mensaje de Telegram sin texto]';
}

interface ContactRow {
  id: string;
  name?: string | null;
  phone: string;
}

async function findOrCreateTelegramContact(
  userId: string,
  phone: string,
  name: string,
): Promise<ContactRow | null> {
  const admin = supabaseAuthAdmin();
  const { data: existing, error: findError } = await admin
    .from('contacts')
    .select('id, name, phone')
    .eq('user_id', userId)
    .eq('phone', phone)
    .maybeSingle();

  if (findError) {
    console.error('[telegram/webhook] contact lookup failed:', findError.message);
    return null;
  }

  if (existing) {
    if (name && name !== existing.name) {
      await admin
        .from('contacts')
        .update({ name, updated_at: new Date().toISOString() })
        .eq('id', existing.id);
    }
    return existing as ContactRow;
  }

  const { data: created, error: createError } = await admin
    .from('contacts')
    .insert({
      user_id: userId,
      phone,
      name,
    })
    .select('id, name, phone')
    .single();

  if (createError) {
    console.error('[telegram/webhook] contact create failed:', createError.message);
    return null;
  }

  return created as ContactRow;
}

interface ConversationRow {
  id: string;
  unread_count?: number | null;
}

async function findOrCreateConversation(
  userId: string,
  contactId: string,
): Promise<ConversationRow | null> {
  const admin = supabaseAuthAdmin();
  const { data: existing, error: findError } = await admin
    .from('conversations')
    .select('id, unread_count')
    .eq('user_id', userId)
    .eq('contact_id', contactId)
    .maybeSingle();

  if (findError) {
    console.error('[telegram/webhook] conversation lookup failed:', findError.message);
    return null;
  }

  if (existing) return existing as ConversationRow;

  const { data: created, error: createError } = await admin
    .from('conversations')
    .insert({
      user_id: userId,
      contact_id: contactId,
    })
    .select('id, unread_count')
    .single();

  if (createError) {
    console.error('[telegram/webhook] conversation create failed:', createError.message);
    return null;
  }

  return created as ConversationRow;
}
