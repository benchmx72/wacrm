import { NextResponse } from 'next/server';
import { supabaseAuthAdmin } from '@/lib/auth/admin-client';
import { createAgentResponse } from '@/lib/ai/openai';
import { buildAgentInstructions, DEFAULT_AGENT_PROMPT } from '@/lib/ai/prompt';
import { decrypt } from '@/lib/whatsapp/encryption';

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
  if (message.from?.is_bot) return;

  const admin = supabaseAuthAdmin();
  const { data: configs, error: configError } = await admin
    .from('telegram_config')
    .select('user_id, bot_token, status')
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

  if (update.message) {
    await maybeRunTelegramAgent({
      userId,
      botToken: config.bot_token as string,
      chatId: String(message.chat.id),
      contact,
      conversation,
      customerText: contentText,
    });
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

interface AgentRow {
  id: string | null;
  name: string;
  model: string;
  temperature: number | string | null;
  is_active: boolean;
  system_prompt: string;
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

async function maybeRunTelegramAgent(input: {
  userId: string;
  botToken: string;
  chatId: string;
  contact: ContactRow;
  conversation: ConversationRow;
  customerText: string;
}) {
  const admin = supabaseAuthAdmin();

  const { data: agent, error: agentError } = await admin
    .from('ai_agents')
    .select('id, name, model, temperature, is_active, system_prompt')
    .eq('user_id', input.userId)
    .eq('role', 'support_sdr')
    .maybeSingle();

  if (agentError) {
    console.error('[telegram/agent] agent lookup failed:', agentError.message);
    return;
  }

  const activeAgent: AgentRow = agent
    ? (agent as AgentRow)
    : {
        id: null,
        name: 'Rod SDR',
        model: 'gpt-4.1-mini',
        temperature: 0.4,
        is_active: true,
        system_prompt: DEFAULT_AGENT_PROMPT,
      };

  if (!activeAgent.is_active) return;

  let sessionId: string;
  let sessionSummary: string | null = null;
  const { data: existingSession, error: sessionFindError } = await admin
    .from('ai_agent_sessions')
    .select('id, summary')
    .eq('user_id', input.userId)
    .eq('conversation_id', input.conversation.id)
    .eq('channel', 'telegram')
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (sessionFindError) {
    console.error('[telegram/agent] session lookup failed:', sessionFindError.message);
    return;
  }

  if (existingSession?.id) {
    sessionId = existingSession.id as string;
    sessionSummary = (existingSession.summary as string | null) ?? null;
  } else {
    const { data: createdSession, error: createSessionError } = await admin
      .from('ai_agent_sessions')
      .insert({
        user_id: input.userId,
        agent_id: activeAgent.id,
        contact_id: input.contact.id,
        conversation_id: input.conversation.id,
        channel: 'telegram',
        title: input.customerText.slice(0, 80),
        status: 'active',
        metadata: {
          source: 'telegram_webhook',
          telegram_chat_id: input.chatId,
        },
      })
      .select('id, summary')
      .single();

    if (createSessionError || !createdSession?.id) {
      console.error(
        '[telegram/agent] session create failed:',
        createSessionError?.message,
      );
      return;
    }

    sessionId = createdSession.id as string;
    sessionSummary = (createdSession.summary as string | null) ?? null;
  }

  const { error: userMessageError } = await admin.from('ai_agent_messages').insert({
    user_id: input.userId,
    session_id: sessionId,
    role: 'user',
    content: input.customerText,
    metadata: {
      source: 'telegram',
      contact_id: input.contact.id,
      conversation_id: input.conversation.id,
    },
  });

  if (userMessageError) {
    console.error('[telegram/agent] user message insert failed:', userMessageError.message);
    return;
  }

  const { data: recentMessages, error: messagesError } = await admin
    .from('ai_agent_messages')
    .select('role, content')
    .eq('session_id', sessionId)
    .eq('user_id', input.userId)
    .in('role', ['user', 'assistant'])
    .order('created_at', { ascending: false })
    .limit(16);

  if (messagesError) {
    console.error('[telegram/agent] recent messages fetch failed:', messagesError.message);
    return;
  }

  const history = ((recentMessages ?? []) as Array<{ role: string; content: string }>)
    .reverse()
    .map((item) => ({
      role: item.role as 'user' | 'assistant',
      content: item.content,
    }));

  try {
    const result = await createAgentResponse({
      model: activeAgent.model,
      instructions: buildAgentInstructions({
        systemPrompt: activeAgent.system_prompt,
        contactContext: [
          `Contact name: ${input.contact.name || 'Telegram lead'}`,
          `Contact channel id: ${input.contact.phone}`,
          'Channel: Telegram',
        ].join('\n'),
        sessionSummary,
        mode: 'live_messaging',
      }),
      messages: history,
      temperature: Number(activeAgent.temperature ?? 0.4),
    });

    const botToken = decrypt(input.botToken);
    const sent = await sendTelegramText({
      botToken,
      chatId: input.chatId,
      text: result.text,
    });
    const telegramMessageId = `telegram:${input.chatId}:${sent.message_id}`;
    const createdAt = new Date(sent.date * 1000).toISOString();

    const { data: assistantMessage, error: assistantInsertError } = await admin
      .from('ai_agent_messages')
      .insert({
        user_id: input.userId,
        session_id: sessionId,
        role: 'assistant',
        content: result.text,
        input_tokens: result.inputTokens,
        output_tokens: result.outputTokens,
        metadata: {
          model: activeAgent.model,
          source: 'telegram_webhook',
        },
      })
      .select('id')
      .single();

    if (assistantInsertError) {
      console.error(
        '[telegram/agent] assistant memory insert failed:',
        assistantInsertError.message,
      );
    }

    const { error: crmInsertError } = await admin.from('messages').insert({
      conversation_id: input.conversation.id,
      sender_type: 'bot',
      content_type: 'text',
      content_text: result.text,
      message_id: telegramMessageId,
      status: 'sent',
      created_at: createdAt,
    });

    if (crmInsertError) {
      console.error('[telegram/agent] crm message insert failed:', crmInsertError.message);
    }

    await admin
      .from('conversations')
      .update({
        last_message_text: result.text,
        last_message_at: createdAt,
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.conversation.id);

    await admin
      .from('ai_agent_sessions')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', sessionId)
      .eq('user_id', input.userId);

    console.log('[telegram/agent] replied', {
      session_id: sessionId,
      ai_message_id: assistantMessage?.id,
      telegram_message_id: telegramMessageId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI response failed';
    console.error('[telegram/agent] failed:', message);
    await admin.from('ai_tool_logs').insert({
      user_id: input.userId,
      agent_id: activeAgent.id,
      session_id: sessionId,
      tool_name: 'telegram.agent_reply',
      status: 'failed',
      input: {
        model: activeAgent.model,
        conversation_id: input.conversation.id,
      },
      error_message: message,
    });
  }
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
    const message =
      payload?.description || `Telegram API respondio con HTTP ${res.status}`;
    throw new Error(message);
  }

  return payload.result as { message_id: number; date: number };
}
