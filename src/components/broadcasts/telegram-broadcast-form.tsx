'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { getClientAccountOwnerId } from '@/lib/auth/account';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Contact } from '@/types';
import { ArrowLeft, Loader2, Send, Users } from 'lucide-react';

export function TelegramBroadcastForm() {
  const router = useRouter();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    async function fetchTelegramContacts() {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from('contacts')
          .select('*')
          .like('phone', 'tg:%')
          .order('created_at', { ascending: false });

        if (error) throw error;
        setContacts(data ?? []);
      } catch (err) {
        toast.error(
          err instanceof Error
            ? err.message
            : 'No se pudieron cargar contactos de Telegram.',
        );
      } finally {
        setLoading(false);
      }
    }

    fetchTelegramContacts();
  }, []);

  const canSend = useMemo(
    () => name.trim().length > 0 && message.trim().length > 0 && contacts.length > 0,
    [contacts.length, message, name],
  );

  async function handleSend() {
    if (!canSend) return;
    setSending(true);

    const supabase = createClient();
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) throw new Error('No hay sesion activa.');
      const accountOwnerId = await getClientAccountOwnerId(supabase, user.id);

      const { data: broadcast, error: broadcastError } = await supabase
        .from('broadcasts')
        .insert({
          user_id: accountOwnerId,
          name: name.trim(),
          template_name: 'Telegram: mensaje libre',
          template_language: 'telegram',
          template_variables: {
            message_text: message.trim(),
          },
          audience_filter: {
            type: 'telegram_all',
          },
          status: 'sending',
          total_recipients: contacts.length,
          sent_count: 0,
          delivered_count: 0,
          read_count: 0,
          replied_count: 0,
          failed_count: 0,
        })
        .select('id')
        .single();

      if (broadcastError || !broadcast) {
        throw new Error(
          `No se pudo crear el disparo: ${broadcastError?.message ?? 'error desconocido'}`,
        );
      }

      const { error: recipientsError } = await supabase
        .from('broadcast_recipients')
        .insert(
          contacts.map((contact) => ({
            broadcast_id: broadcast.id,
            contact_id: contact.id,
            status: 'pending',
          })),
        );

      if (recipientsError) {
        throw new Error(
          `No se pudieron crear destinatarios: ${recipientsError.message}`,
        );
      }

      const res = await fetch('/api/telegram/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          broadcast_id: broadcast.id,
          message_text: message.trim(),
        }),
      });
      const payload = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(payload?.error ?? 'No se pudo enviar el disparo.');
      }

      toast.success(
        `Disparo enviado: ${payload.sent_count ?? 0} enviados, ${payload.failed_count ?? 0} fallidos.`,
      );
      router.push(`/broadcasts/${broadcast.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo enviar.');
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Nueva campana Telegram</h1>
        <p className="mt-1 text-sm text-slate-400">
          Envia un mensaje de texto libre a los contactos que ya hablaron con el bot.
        </p>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-medium text-white">
              {contacts.length.toLocaleString()} contactos Telegram
            </p>
            <p className="text-xs text-slate-400">
              Solo se incluyen contactos con identificador Telegram guardado.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-5">
        <div>
          <label className="text-sm font-medium text-white">Nombre del disparo</label>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ej. Promocion consulta inicial"
            className="mt-2 h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-primary focus:ring-1 focus:ring-primary"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-white">Mensaje</label>
          <Textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Escribe el mensaje que recibiran tus contactos por Telegram..."
            className="mt-2 min-h-40 border-slate-700 bg-slate-950 text-white placeholder:text-slate-500"
          />
          <p className="mt-2 text-xs text-slate-500">
            Telegram permite texto libre. Evita spam y envia solo a contactos que aceptaron escribir al bot.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-slate-800 pt-4">
        <Button
          variant="outline"
          onClick={() => router.push('/broadcasts')}
          className="border-slate-700 text-slate-300"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver
        </Button>
        <Button
          onClick={handleSend}
          disabled={!canSend || sending}
          className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {sending ? 'Enviando...' : 'Enviar campana'}
        </Button>
      </div>
    </div>
  );
}
