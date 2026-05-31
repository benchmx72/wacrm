'use client';

import { useEffect, useState } from 'react';
import { Loader2, RadioTower } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { getClientAccountOwnerId } from '@/lib/auth/account';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { MessagingChannel } from '@/types';

const CHANNEL_LABELS: Record<MessagingChannel, string> = {
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
};

export function MessagingChannelPanel() {
  const supabase = createClient();
  const { user, profile, refreshProfile, signOut } = useAuth();
  const [channel, setChannel] = useState<MessagingChannel>('whatsapp');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setChannel(profile?.messaging_channel ?? 'whatsapp');
  }, [profile?.messaging_channel]);

  async function handleSave() {
    if (!user || !profile) return;

    try {
      setSaving(true);
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session?.user) {
        toast.error('Tu sesion expiro. Vuelve a iniciar sesion para guardar cambios.');
        await signOut();
        return;
      }

      const accountOwnerId = await getClientAccountOwnerId(
        supabase,
        session.user.id,
      );
      const { error } = await supabase
        .from('profiles')
        .update({ messaging_channel: channel })
        .eq('user_id', accountOwnerId);

      if (error) throw error;

      await refreshProfile();
      toast.success(`Canal de mensajeria actualizado a ${CHANNEL_LABELS[channel]}`);
    } catch (err) {
      console.error('Messaging channel save error:', err);
      toast.error('No se pudo actualizar el canal de mensajeria');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="bg-slate-900 border-slate-700 ring-0 ring-transparent">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-white">
          <RadioTower className="size-4 text-primary" />
          Canal del cliente
        </CardTitle>
        <CardDescription className="text-slate-400">
          Define que plataforma de mensajeria vera y configurara esta cuenta.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-[minmax(240px,360px)_auto] sm:items-end">
        <div className="space-y-2">
          <Label className="text-slate-300">Plataforma activa</Label>
          <Select
            value={channel}
            onValueChange={(value) => setChannel(value as MessagingChannel)}
          >
            <SelectTrigger className="w-full bg-slate-800 border-slate-700 text-white">
              <SelectValue>
                {CHANNEL_LABELS[channel]}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700">
              <SelectItem value="whatsapp" className="text-white focus:bg-slate-700 focus:text-white">
                WhatsApp
              </SelectItem>
              <SelectItem value="telegram" className="text-white focus:bg-slate-700 focus:text-white">
                Telegram
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          onClick={handleSave}
          disabled={saving || channel === (profile?.messaging_channel ?? 'whatsapp')}
          className="bg-primary hover:bg-primary/90 text-primary-foreground"
        >
          {saving ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Guardando...
            </>
          ) : (
            'Guardar canal'
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
