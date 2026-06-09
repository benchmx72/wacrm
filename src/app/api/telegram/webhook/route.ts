import { NextResponse } from 'next/server';
import { supabaseAuthAdmin } from '@/lib/auth/admin-client';
import { createAgentResponse, transcribeAudio } from '@/lib/ai/openai';
import { buildAgentInstructions, DEFAULT_AGENT_PROMPT } from '@/lib/ai/prompt';
import { buildContactAppointmentContext } from '@/lib/appointments/context';
import {
  appointmentChangeRequestInstructions,
  captureAppointmentChangeRequest,
} from '@/lib/appointments/change-requests';
import { decrypt } from '@/lib/whatsapp/encryption';
import {
  downloadTelegramMedia,
  prepareTelegramAudioForTranscription,
} from '@/lib/telegram/media';

const DEFAULT_PIPELINE_STAGES = [
  { name: 'Nuevo lead', color: '#3b82f6', position: 0 },
  { name: 'Calificado', color: '#eab308', position: 1 },
  { name: 'Propuesta enviada', color: '#f97316', position: 2 },
  { name: 'Negociacion', color: '#8b5cf6', position: 3 },
  { name: 'Ganado', color: '#22c55e', position: 4 },
];

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
  voice?: TelegramAudio;
  audio?: TelegramAudio;
}

interface TelegramAudio {
  file_id: string;
  file_unique_id: string;
  duration: number;
  mime_type?: string;
  file_size?: number;
  file_name?: string;
  title?: string;
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

  const incoming = await resolveTelegramMessageContent({
    message,
    encryptedBotToken: config.bot_token as string,
  });

  const contact = await findOrCreateTelegramContact(
    userId,
    contactIdentity,
    contactName,
  );
  if (!contact) return;
  const leadData = incoming.canUseAsAgentInput
    ? await captureLeadDataFromText(userId, contact, incoming.contentText)
    : {
        email: contact.email ?? undefined,
        intent: undefined,
        realPhone: undefined,
      };

  const conversation = await findOrCreateConversation(userId, contact.id);
  if (!conversation) return;

  const createdAt = new Date(message.date * 1000).toISOString();
  const { error: insertError } = await admin.from('messages').insert({
    conversation_id: conversation.id,
    sender_type: 'customer',
    content_type: incoming.contentType,
    content_text: incoming.contentText,
    media_url: incoming.mediaUrl,
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
      last_message_text: incoming.previewText,
      last_message_at: createdAt,
      unread_count: (conversation.unread_count ?? 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversation.id);

  if (updateError) {
    console.error('[telegram/webhook] conversation update failed:', updateError.message);
  }

  await maybeCreateTelegramDeal({
    userId,
    contact,
    conversation,
    leadData,
    customerText: incoming.contentText,
  });

  const appointmentChangeRequest = incoming.canUseAsAgentInput
    ? await captureAppointmentChangeRequest({
        supabase: admin,
        accountOwnerId: userId,
        contactId: contact.id,
        conversationId: conversation.id,
        customerText: incoming.contentText,
        source: 'telegram',
      })
    : null;

  if (update.message && incoming.canUseAsAgentInput) {
    if (conversation.ai_paused) {
      console.log('[telegram/agent] skipped because AI is paused', {
        conversation_id: conversation.id,
      });
      return;
    }

    await maybeRunTelegramAgent({
      userId,
      botToken: config.bot_token as string,
      chatId: String(message.chat.id),
      contact,
      leadData,
      conversation,
      customerText: incoming.contentText,
      appointmentChangeRequestContext: appointmentChangeRequestInstructions(
        appointmentChangeRequest,
      ),
    });
  }
}

interface ResolvedTelegramContent {
  contentType: 'text' | 'audio';
  contentText: string;
  previewText: string;
  mediaUrl?: string;
  canUseAsAgentInput: boolean;
}

async function resolveTelegramMessageContent(input: {
  message: TelegramMessage;
  encryptedBotToken: string;
}): Promise<ResolvedTelegramContent> {
  const audio = input.message.voice ?? input.message.audio;
  if (!audio) {
    const contentText = getTelegramMessageText(input.message);
    return {
      contentType: 'text',
      contentText,
      previewText: contentText,
      canUseAsAgentInput: Boolean(input.message.text || input.message.caption),
    };
  }

  const mediaUrl = `/api/telegram/media/${encodeURIComponent(audio.file_id)}`;

  try {
    const media = await downloadTelegramMedia({
      botToken: decrypt(input.encryptedBotToken),
      fileId: audio.file_id,
      mimeType: audio.mime_type,
      fileName: audio.file_name,
    });
    const prepared = await prepareTelegramAudioForTranscription(media);
    const transcript = await transcribeAudio(prepared);

    return {
      contentType: 'audio',
      contentText: transcript,
      previewText: `Audio: ${transcript}`,
      mediaUrl,
      canUseAsAgentInput: true,
    };
  } catch (error) {
    console.error('[telegram/webhook] audio transcription failed:', error);
    return {
      contentType: 'audio',
      contentText: 'Mensaje de voz',
      previewText: 'Mensaje de voz',
      mediaUrl,
      canUseAsAgentInput: false,
    };
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

function extractEmail(text: string) {
  return text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]?.toLowerCase();
}

function extractPhone(text: string) {
  const candidates = text.match(/(?:\+?\d[\d\s().-]{7,}\d)/g) ?? [];
  for (const candidate of candidates) {
    const digits = candidate.replace(/\D/g, '');
    if (digits.length >= 8 && digits.length <= 16) {
      return candidate.trim();
    }
  }
  return undefined;
}

function detectLeadIntent(text: string) {
  const normalized = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');

  if (
    /\b(contratar|comprar|demo|cotizacion|cotizar|precio|precios|costo|costos|agenda|agendar|reunion|llamada|asesor|asesoria|especialista|contacto|contactarme|contactar|planes|plan)\b/.test(
      normalized,
    )
  ) {
    return 'alta';
  }

  if (
    /\b(informacion|info|servicios|servicio|producto|productos|como funciona|me interesa|interes|interesado|interesada|quiero saber|saber mas|sistema|crm|clinica|clinicas|consultorio|despacho|negocio|necesito|busco)\b/.test(
      normalized,
    )
  ) {
    return 'media';
  }

  return 'exploracion';
}

function leadIntentRank(intent?: string | null) {
  if (intent === 'alta') return 3;
  if (intent === 'media') return 2;
  if (intent === 'exploracion') return 1;
  return 0;
}

function strongestLeadIntent(
  previousIntent: string | null | undefined,
  detectedIntent: string,
) {
  return leadIntentRank(previousIntent) > leadIntentRank(detectedIntent) && previousIntent
    ? previousIntent
    : detectedIntent;
}

function shouldCreateDealForIntent(intent?: string) {
  return intent === 'media' || intent === 'alta';
}

async function captureLeadDataFromText(
  userId: string,
  contact: ContactRow,
  text: string,
): Promise<LeadData> {
  const email = extractEmail(text);
  const realPhone = extractPhone(text);
  const previousIntent = await getContactCustomValue(
    userId,
    contact.id,
    'intencion_lead',
  );
  const existingRealPhone = await getContactCustomValue(
    userId,
    contact.id,
    'telefono_real',
  );
  const intent = strongestLeadIntent(previousIntent, detectLeadIntent(text));
  const admin = supabaseAuthAdmin();

  if (email && email !== contact.email) {
    const { error } = await admin
      .from('contacts')
      .update({ email, updated_at: new Date().toISOString() })
      .eq('id', contact.id)
      .eq('user_id', userId);

    if (error) {
      console.error('[telegram/webhook] email capture failed:', error.message);
    } else {
      contact.email = email;
    }
  }

  await upsertContactCustomValue(userId, contact.id, 'intencion_lead', intent);

  if (realPhone) {
    await upsertContactCustomValue(userId, contact.id, 'telefono_real', realPhone);
  }

  return {
    email: email ?? contact.email ?? undefined,
    realPhone: realPhone ?? existingRealPhone ?? undefined,
    intent: intent ?? undefined,
  };
}

async function getContactCustomValue(
  userId: string,
  contactId: string,
  fieldName: string,
) {
  const admin = supabaseAuthAdmin();
  const { data: field, error: fieldError } = await admin
    .from('custom_fields')
    .select('id')
    .eq('user_id', userId)
    .eq('field_name', fieldName)
    .maybeSingle();

  if (fieldError) {
    console.error('[telegram/webhook] custom field lookup failed:', fieldError.message);
    return null;
  }

  if (!field?.id) return null;

  const { data: value, error: valueError } = await admin
    .from('contact_custom_values')
    .select('value')
    .eq('contact_id', contactId)
    .eq('custom_field_id', field.id)
    .maybeSingle();

  if (valueError) {
    console.error('[telegram/webhook] custom value lookup failed:', valueError.message);
    return null;
  }

  return typeof value?.value === 'string' ? value.value : null;
}

async function upsertContactCustomValue(
  userId: string,
  contactId: string,
  fieldName: string,
  value: string,
) {
  const admin = supabaseAuthAdmin();
  const { data: field, error: fieldError } = await admin
    .from('custom_fields')
    .select('id')
    .eq('user_id', userId)
    .eq('field_name', fieldName)
    .maybeSingle();

  if (fieldError) {
    console.error('[telegram/webhook] custom field lookup failed:', fieldError.message);
    return;
  }

  let fieldId = field?.id as string | undefined;
  if (!fieldId) {
    const { data: createdField, error: createFieldError } = await admin
      .from('custom_fields')
      .insert({
        user_id: userId,
        field_name: fieldName,
        field_type: 'text',
      })
      .select('id')
      .single();

    if (createFieldError || !createdField?.id) {
      console.error(
        '[telegram/webhook] custom field create failed:',
        createFieldError?.message,
      );
      return;
    }

    fieldId = createdField.id as string;
  }

  const { error: valueError } = await admin
    .from('contact_custom_values')
    .upsert(
      {
        contact_id: contactId,
        custom_field_id: fieldId,
        value,
      },
      { onConflict: 'contact_id,custom_field_id' },
    );

  if (valueError) {
    console.error('[telegram/webhook] custom value upsert failed:', valueError.message);
  }
}

interface ContactRow {
  id: string;
  name?: string | null;
  phone: string;
  email?: string | null;
}

async function findOrCreateTelegramContact(
  userId: string,
  phone: string,
  name: string,
): Promise<ContactRow | null> {
  const admin = supabaseAuthAdmin();
  const { data: existing, error: findError } = await admin
    .from('contacts')
    .select('id, name, phone, email')
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
    .select('id, name, phone, email')
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
  ai_paused?: boolean | null;
}

interface AgentRow {
  id: string | null;
  name: string;
  model: string;
  temperature: number | string | null;
  is_active: boolean;
  system_prompt: string;
}

interface LeadData {
  email?: string;
  realPhone?: string;
  intent?: string;
}

interface PipelineRow {
  id: string;
}

interface PipelineStageRow {
  id: string;
}

async function findOrCreateConversation(
  userId: string,
  contactId: string,
): Promise<ConversationRow | null> {
  const admin = supabaseAuthAdmin();
  const { data: existing, error: findError } = await admin
    .from('conversations')
    .select('id, unread_count, ai_paused')
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
    .select('id, unread_count, ai_paused')
    .single();

  if (createError) {
    console.error('[telegram/webhook] conversation create failed:', createError.message);
    return null;
  }

  return created as ConversationRow;
}

async function getOrCreateDefaultPipeline(userId: string): Promise<PipelineRow | null> {
  const admin = supabaseAuthAdmin();
  const { data: existing, error: existingError } = await admin
    .from('pipelines')
    .select('id')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existingError) {
    console.error('[telegram/deal] pipeline lookup failed:', existingError.message);
    return null;
  }

  if (existing?.id) return existing as PipelineRow;

  const { data: pipeline, error: pipelineError } = await admin
    .from('pipelines')
    .insert({ user_id: userId, name: 'Pipeline de ventas' })
    .select('id')
    .single();

  if (pipelineError || !pipeline?.id) {
    console.error('[telegram/deal] pipeline create failed:', pipelineError?.message);
    return null;
  }

  const { error: stagesError } = await admin.from('pipeline_stages').insert(
    DEFAULT_PIPELINE_STAGES.map((stage) => ({
      pipeline_id: pipeline.id,
      ...stage,
    })),
  );

  if (stagesError) {
    console.error('[telegram/deal] default stages create failed:', stagesError.message);
  }

  return pipeline as PipelineRow;
}

async function getFirstPipelineStage(
  pipelineId: string,
): Promise<PipelineStageRow | null> {
  const admin = supabaseAuthAdmin();
  const { data: stage, error } = await admin
    .from('pipeline_stages')
    .select('id')
    .eq('pipeline_id', pipelineId)
    .order('position', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[telegram/deal] stage lookup failed:', error.message);
    return null;
  }

  return (stage as PipelineStageRow | null) ?? null;
}

async function maybeCreateTelegramDeal(input: {
  userId: string;
  contact: ContactRow;
  conversation: ConversationRow;
  leadData: LeadData;
  customerText: string;
}) {
  if (!shouldCreateDealForIntent(input.leadData.intent)) return;

  const admin = supabaseAuthAdmin();
  const { data: existingDeal, error: existingDealError } = await admin
    .from('deals')
    .select('id')
    .eq('user_id', input.userId)
    .eq('contact_id', input.contact.id)
    .eq('status', 'open')
    .limit(1)
    .maybeSingle();

  if (existingDealError) {
    console.error('[telegram/deal] duplicate lookup failed:', existingDealError.message);
    return;
  }

  if (existingDeal?.id) return;

  const pipeline = await getOrCreateDefaultPipeline(input.userId);
  if (!pipeline) return;

  const firstStage = await getFirstPipelineStage(pipeline.id);
  if (!firstStage) {
    console.error('[telegram/deal] no stage found for pipeline:', pipeline.id);
    return;
  }

  const notes = [
    'Fuente: Telegram',
    `Intencion detectada: ${input.leadData.intent}`,
    input.leadData.email ? `Email: ${input.leadData.email}` : '',
    input.leadData.realPhone ? `Telefono real: ${input.leadData.realPhone}` : '',
    `ID Telegram: ${input.contact.phone}`,
    `Ultimo mensaje: ${input.customerText}`,
  ]
    .filter(Boolean)
    .join('\n');

  const { error: insertError } = await admin.from('deals').insert({
    user_id: input.userId,
    pipeline_id: pipeline.id,
    stage_id: firstStage.id,
    contact_id: input.contact.id,
    conversation_id: input.conversation.id,
    title: `Lead Telegram - ${input.contact.name || input.contact.phone}`,
    value: 0,
    currency: 'USD',
    notes,
    status: 'open',
  });

  if (insertError) {
    console.error('[telegram/deal] create failed:', insertError.message);
  }
}

async function maybeRunTelegramAgent(input: {
  userId: string;
  botToken: string;
  chatId: string;
  contact: ContactRow;
  leadData: LeadData;
  conversation: ConversationRow;
  customerText: string;
  appointmentChangeRequestContext?: string;
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
    const appointmentContext = await buildContactAppointmentContext({
      supabase: admin,
      accountOwnerId: input.userId,
      contactId: input.contact.id,
    });

    const result = await createAgentResponse({
      model: activeAgent.model,
      instructions: buildAgentInstructions({
        systemPrompt: activeAgent.system_prompt,
        contactContext: [
          `Contact name: ${input.contact.name || 'Telegram lead'}`,
          `Contact channel id: ${input.contact.phone}`,
          `Email: ${input.leadData.email || input.contact.email || 'unknown'}`,
          `Real phone: ${input.leadData.realPhone || 'unknown'}`,
          `Detected intent: ${input.leadData.intent || 'unknown'}`,
          `Missing follow-up data: ${[
            input.leadData.email || input.contact.email ? '' : 'email',
            input.leadData.realPhone ? '' : 'real phone',
          ].filter(Boolean).join(', ') || 'none'}`,
          'Channel: Telegram',
          appointmentContext,
          input.appointmentChangeRequestContext || '',
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
