import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServerAccountOwnerId } from '@/lib/auth/account';
import { supabaseAuthAdmin } from '@/lib/auth/admin-client';
import { encrypt, decrypt } from '@/lib/whatsapp/encryption';

async function verifyTelegramBot(botToken: string) {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/getMe`, {
    method: 'GET',
    cache: 'no-store',
  });
  const payload = await res.json().catch(() => null);

  if (!res.ok || !payload?.ok) {
    const description =
      payload?.description || `Telegram API respondio con HTTP ${res.status}`;
    throw new Error(description);
  }

  return payload.result as {
    id: number;
    is_bot: boolean;
    first_name: string;
    username?: string;
  };
}

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const accountOwnerId = await getServerAccountOwnerId(supabase, user.id);
    const admin = supabaseAuthAdmin();
    const { data: config, error } = await admin
      .from('telegram_config')
      .select('bot_token, bot_username, status')
      .eq('user_id', accountOwnerId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching telegram_config:', error);
      return NextResponse.json(
        { connected: false, reason: 'db_error', message: 'No se pudo leer la configuracion' },
        { status: 200 },
      );
    }

    if (!config) {
      return NextResponse.json(
        {
          connected: false,
          reason: 'no_config',
          message: 'Aun no hay configuracion de Telegram guardada.',
        },
        { status: 200 },
      );
    }

    let botToken: string;
    try {
      botToken = decrypt(config.bot_token);
    } catch (err) {
      console.error('[telegram/config GET] Token decryption failed:', err);
      return NextResponse.json(
        {
          connected: false,
          reason: 'token_corrupted',
          needs_reset: true,
          message: 'El token guardado no se puede descifrar con la ENCRYPTION_KEY actual.',
        },
        { status: 200 },
      );
    }

    try {
      const bot = await verifyTelegramBot(botToken);
      return NextResponse.json({ connected: true, bot });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido de Telegram';
      console.error('[telegram/config GET] Telegram verification failed:', message);
      return NextResponse.json(
        {
          connected: false,
          reason: 'telegram_api_error',
          message: `Telegram rechazo las credenciales: ${message}`,
        },
        { status: 200 },
      );
    }
  } catch (error) {
    console.error('Error in Telegram config GET:', error);
    return NextResponse.json(
      { connected: false, reason: 'unknown', message: 'Error interno del servidor' },
      { status: 500 },
    );
  }
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

    const accountOwnerId = await getServerAccountOwnerId(supabase, user.id);
    const admin = supabaseAuthAdmin();
    const body = await request.json();
    const { bot_token, bot_username, webhook_secret } = body;

    if (!bot_token || !bot_username) {
      return NextResponse.json(
        { error: 'bot_token y bot_username son obligatorios' },
        { status: 400 },
      );
    }

    let bot;
    try {
      bot = await verifyTelegramBot(bot_token);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido de Telegram';
      return NextResponse.json(
        { error: `Telegram API: ${message}` },
        { status: 400 },
      );
    }

    let encryptedBotToken: string;
    try {
      encryptedBotToken = encrypt(bot_token);
    } catch (err) {
      console.error('Telegram token encryption failed:', err);
      return NextResponse.json(
        { error: 'No se pudo cifrar el token. Revisa ENCRYPTION_KEY.' },
        { status: 500 },
      );
    }

    const row = {
      user_id: accountOwnerId,
      bot_token: encryptedBotToken,
      bot_username: String(bot_username).replace(/^@/, ''),
      webhook_secret: webhook_secret || null,
      status: 'connected',
      connected_at: new Date().toISOString(),
    };

    const { error: upsertError } = await admin
      .from('telegram_config')
      .upsert(row, { onConflict: 'user_id' });

    if (upsertError) {
      console.error('Error saving telegram_config:', upsertError);
      return NextResponse.json(
        { error: upsertError.message || 'No se pudo guardar la configuracion' },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, bot });
  } catch (error) {
    console.error('Error in Telegram config POST:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const accountOwnerId = await getServerAccountOwnerId(supabase, user.id);
    const admin = supabaseAuthAdmin();
    const { error } = await admin
      .from('telegram_config')
      .delete()
      .eq('user_id', accountOwnerId);

    if (error) {
      console.error('Error deleting telegram_config:', error);
      return NextResponse.json(
        { error: 'No se pudo eliminar la configuracion' },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in Telegram config DELETE:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
