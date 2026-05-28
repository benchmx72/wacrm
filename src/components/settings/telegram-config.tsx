'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Bot,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  RotateCcw,
  Send,
  XCircle,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

const MASKED_TOKEN = '****************';

type ConnectionStatus = 'connected' | 'disconnected' | 'unknown';

export function TelegramConfig() {
  const supabase = createClient();
  const { user, profile, loading: authLoading } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [hasConfig, setHasConfig] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('unknown');
  const [statusMessage, setStatusMessage] = useState('');

  const [botToken, setBotToken] = useState('');
  const [botUsername, setBotUsername] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [tokenEdited, setTokenEdited] = useState(false);

  const webhookUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/api/telegram/webhook`
      : '';

  const fetchConfig = useCallback(async (userId: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('telegram_config')
        .select('bot_username, webhook_secret, status')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setHasConfig(true);
        setBotToken(MASKED_TOKEN);
        setBotUsername(data.bot_username || '');
        setWebhookSecret(data.webhook_secret || '');
        setTokenEdited(false);
      } else {
        setHasConfig(false);
        setBotToken('');
        setBotUsername('');
        setWebhookSecret('');
        setTokenEdited(false);
      }

      await handleTestConnection(false);
    } catch (err) {
      console.error('Telegram config fetch error:', err);
      toast.error('No se pudo cargar la configuracion de Telegram');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }
    fetchConfig(profile?.account_owner_id ?? user.id);
  }, [authLoading, user, profile?.account_owner_id, fetchConfig]);

  async function handleSave() {
    if (!botUsername.trim()) {
      toast.error('El usuario del bot es obligatorio');
      return;
    }
    if (!hasConfig && (!botToken.trim() || !tokenEdited)) {
      toast.error('El token del bot es obligatorio');
      return;
    }
    if (hasConfig && (!tokenEdited || botToken === MASKED_TOKEN)) {
      toast.error('Vuelve a ingresar el token del bot para guardar cambios');
      return;
    }

    try {
      setSaving(true);
      const res = await fetch('/api/telegram/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bot_token: botToken.trim(),
          bot_username: botUsername.trim(),
          webhook_secret: webhookSecret.trim() || null,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'No se pudo guardar la configuracion');
        return;
      }

      toast.success(
        data.bot?.username
          ? `Conectado a @${data.bot.username}`
          : 'Configuracion de Telegram guardada',
      );
      setHasConfig(true);
      setConnectionStatus('connected');
      if (user) await fetchConfig(profile?.account_owner_id ?? user.id);
    } catch (err) {
      console.error('Telegram save error:', err);
      toast.error('No se pudo guardar la configuracion');
    } finally {
      setSaving(false);
    }
  }

  async function handleTestConnection(showToast = true) {
    try {
      setTesting(true);
      const res = await fetch('/api/telegram/config', { method: 'GET' });
      const payload = await res.json();

      if (payload.connected) {
        setConnectionStatus('connected');
        setStatusMessage('');
        if (payload.bot?.username) setBotUsername(payload.bot.username);
        if (showToast) toast.success(`Conexion correcta con @${payload.bot?.username || 'Telegram'}`);
      } else {
        setConnectionStatus('disconnected');
        setStatusMessage(payload.message || '');
        if (showToast) toast.error(payload.message || 'La conexion con Telegram fallo');
      }
    } catch (err) {
      console.error('Telegram test error:', err);
      setConnectionStatus('disconnected');
      if (showToast) toast.error('La prueba de conexion fallo. Revisa la red e intenta de nuevo.');
    } finally {
      setTesting(false);
    }
  }

  async function handleReset() {
    if (!confirm('Esto eliminara la configuracion actual de Telegram. Continuar?')) {
      return;
    }

    try {
      setResetting(true);
      const res = await fetch('/api/telegram/config', { method: 'DELETE' });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'No se pudo reiniciar la configuracion');
        return;
      }

      toast.success('Configuracion de Telegram eliminada');
      setHasConfig(false);
      setBotToken('');
      setBotUsername('');
      setWebhookSecret('');
      setTokenEdited(false);
      setConnectionStatus('disconnected');
      setStatusMessage('');
    } catch (err) {
      console.error('Telegram reset error:', err);
      toast.error('No se pudo reiniciar la configuracion');
    } finally {
      setResetting(false);
    }
  }

  function handleCopyWebhookUrl() {
    navigator.clipboard.writeText(webhookUrl);
    toast.success('URL del webhook copiada');
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px] mt-4">
      <div className="space-y-6">
        <Alert className="bg-slate-900 border-slate-700">
          <div className="flex items-center gap-2">
            {connectionStatus === 'connected' ? (
              <CheckCircle2 className="size-4 text-primary" />
            ) : (
              <XCircle className="size-4 text-red-500" />
            )}
            <AlertTitle className="text-white mb-0">
              {connectionStatus === 'connected' ? 'Conectado' : 'No conectado'}
            </AlertTitle>
          </div>
          <AlertDescription className="text-slate-400">
            {connectionStatus === 'connected'
              ? 'Tu bot de Telegram esta conectado y listo para recibir mensajes.'
              : statusMessage || 'Configura el token de tu bot para conectar Telegram.'}
          </AlertDescription>
        </Alert>

        <Card className="bg-slate-900 border-slate-700 ring-0 ring-transparent">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <Send className="size-4 text-primary" />
              Credenciales de Telegram
            </CardTitle>
            <CardDescription className="text-slate-400">
              Usa el token generado por BotFather para conectar el bot del cliente.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-slate-300">Usuario del bot</Label>
              <Input
                placeholder="ej. sophia_cliente_bot"
                value={botUsername}
                onChange={(e) => setBotUsername(e.target.value.replace(/^@/, ''))}
                className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-slate-300">Token del bot</Label>
              <div className="relative">
                <Input
                  type={showToken ? 'text' : 'password'}
                  placeholder="Ingresa el token de BotFather"
                  value={botToken}
                  onChange={(e) => {
                    setBotToken(e.target.value);
                    setTokenEdited(true);
                  }}
                  onFocus={() => {
                    if (botToken === MASKED_TOKEN) {
                      setBotToken('');
                      setTokenEdited(true);
                    }
                  }}
                  className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                >
                  {showToken ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              {hasConfig && !tokenEdited && (
                <p className="text-xs text-slate-500">
                  El token esta oculto por seguridad. Vuelve a ingresarlo para actualizar la configuracion.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-slate-300">Secreto del webhook</Label>
              <Input
                placeholder="Opcional: token secreto para validar Telegram"
                value={webhookSecret}
                onChange={(e) => setWebhookSecret(e.target.value)}
                className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
              />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-700 ring-0 ring-transparent">
          <CardHeader>
            <CardTitle className="text-white">Configuracion del webhook</CardTitle>
            <CardDescription className="text-slate-400">
              Usa esta URL cuando registremos el webhook del bot en Telegram.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label className="text-slate-300">URL de callback del webhook</Label>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={webhookUrl}
                  className="bg-slate-800 border-slate-700 text-slate-300 font-mono text-sm"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleCopyWebhookUrl}
                  className="shrink-0 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800"
                >
                  <Copy className="size-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-3">
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            {saving ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Guardando...
              </>
            ) : (
              'Guardar configuracion'
            )}
          </Button>
          <Button
            variant="outline"
            onClick={() => handleTestConnection(true)}
            disabled={testing || (!hasConfig && connectionStatus !== 'connected')}
            className="border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800"
          >
            {testing ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Probando...
              </>
            ) : (
              <>
                <Zap className="size-4" />
                Probar conexion
              </>
            )}
          </Button>
          {hasConfig && (
            <Button
              variant="outline"
              onClick={handleReset}
              disabled={resetting}
              className="border-red-900 text-red-400 hover:text-red-300 hover:bg-red-950/40"
            >
              {resetting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Reiniciando...
                </>
              ) : (
                <>
                  <RotateCcw className="size-4" />
                  Reiniciar configuracion
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      <Card className="bg-slate-900 border-slate-700 ring-0 ring-transparent h-fit">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white text-base">
            <Bot className="size-4 text-primary" />
            Alta rapida del bot
          </CardTitle>
          <CardDescription className="text-slate-400">
            Telegram es mas simple que Meta: se crea un bot, se pega el token y se registra el webhook.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-slate-400">
          <p>1. Abre BotFather en Telegram y crea un bot nuevo.</p>
          <p>2. Copia el token y el usuario del bot en esta pantalla.</p>
          <p>3. Guarda y prueba la conexion.</p>
          <p>4. En el siguiente paso conectaremos el webhook para recibir mensajes reales.</p>
        </CardContent>
      </Card>
    </div>
  );
}
