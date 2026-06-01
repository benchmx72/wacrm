'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { getClientAccountOwnerId } from '@/lib/auth/account';
import { useLanguage } from '@/hooks/use-language';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Contact, Tag } from '@/types';
import { ArrowLeft, Loader2, Send, Tags, Users } from 'lucide-react';

export function TelegramBroadcastForm() {
  const router = useRouter();
  const { locale, t } = useLanguage();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [contactTagIds, setContactTagIds] = useState<Record<string, string[]>>({});
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
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

        const { data: tagRows, error: tagsError } = await supabase
          .from('tags')
          .select('*')
          .order('name');
        if (tagsError) throw tagsError;
        setTags(tagRows ?? []);

        if (data && data.length > 0) {
          const { data: contactTags, error: contactTagsError } = await supabase
            .from('contact_tags')
            .select('contact_id, tag_id')
            .in(
              'contact_id',
              data.map((contact) => contact.id),
            );
          if (contactTagsError) throw contactTagsError;

          const index: Record<string, string[]> = {};
          for (const row of contactTags ?? []) {
            index[row.contact_id] = [...(index[row.contact_id] ?? []), row.tag_id];
          }
          setContactTagIds(index);
        }
      } catch (err) {
        toast.error(
          err instanceof Error
            ? err.message
            : t('broadcasts.telegram.failedLoadContacts'),
        );
      } finally {
        setLoading(false);
      }
    }

    fetchTelegramContacts();
  }, [t]);

  const filteredContacts = useMemo(() => {
    if (selectedTagIds.length === 0) return contacts;
    const selected = new Set(selectedTagIds);
    return contacts.filter((contact) =>
      (contactTagIds[contact.id] ?? []).some((tagId) => selected.has(tagId)),
    );
  }, [contactTagIds, contacts, selectedTagIds]);

  const canSend = useMemo(
    () => name.trim().length > 0 && message.trim().length > 0 && filteredContacts.length > 0,
    [filteredContacts.length, message, name],
  );

  function toggleTag(tagId: string) {
    setSelectedTagIds((current) =>
      current.includes(tagId)
        ? current.filter((id) => id !== tagId)
        : [...current, tagId],
    );
  }

  async function handleSend() {
    if (!canSend) return;
    setSending(true);

    const supabase = createClient();
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) throw new Error(t('broadcasts.telegram.noSession'));
      const accountOwnerId = await getClientAccountOwnerId(supabase, user.id);

      const { data: broadcast, error: broadcastError } = await supabase
        .from('broadcasts')
        .insert({
          user_id: accountOwnerId,
          name: name.trim(),
          template_name: t('broadcasts.telegram.freeTextTemplate'),
          template_language: 'telegram',
          template_variables: {
            message_text: message.trim(),
          },
          audience_filter: {
            type: selectedTagIds.length > 0 ? 'telegram_tags' : 'telegram_all',
            tagIds: selectedTagIds,
          },
          status: 'sending',
          total_recipients: filteredContacts.length,
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
          t('broadcasts.telegram.failedCreate', {
            message: broadcastError?.message ?? t('common.unknownError'),
          }),
        );
      }

      const { error: recipientsError } = await supabase
        .from('broadcast_recipients')
        .insert(
          filteredContacts.map((contact) => ({
            broadcast_id: broadcast.id,
            contact_id: contact.id,
            status: 'pending',
          })),
        );

      if (recipientsError) {
        throw new Error(
          t('broadcasts.telegram.failedRecipients', { message: recipientsError.message }),
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
        throw new Error(payload?.error ?? t('broadcasts.telegram.failedSend'));
      }

      toast.success(
        t('broadcasts.telegram.sentToast', {
          sent: payload.sent_count ?? 0,
          failed: payload.failed_count ?? 0,
        }),
      );
      router.push(`/broadcasts/${broadcast.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('broadcasts.telegram.failedSend'));
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
        <h1 className="text-2xl font-bold text-white">
          {t('broadcasts.telegram.title')}
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          {t('broadcasts.telegram.description')}
        </p>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-medium text-white">
              {t('broadcasts.telegram.contactCount', {
                count: filteredContacts.length.toLocaleString(locale),
              })}
            </p>
            <p className="text-xs text-slate-400">
              {selectedTagIds.length > 0
                ? t('broadcasts.telegram.filteredByTags')
                : t('broadcasts.telegram.allTelegramContacts')}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <div className="mb-3 flex items-center gap-2">
          <Tags className="h-4 w-4 text-primary" />
          <p className="text-sm font-medium text-white">
            {t('broadcasts.telegram.audienceByTags')}
          </p>
          <span className="text-xs text-slate-500">
            {t('broadcasts.telegram.optional')}
          </span>
        </div>
        {tags.length === 0 ? (
          <p className="text-xs text-slate-500">
            {t('broadcasts.telegram.noTags')}
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => {
              const isSelected = selectedTagIds.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => toggleTag(tag.id)}
                  className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                    isSelected
                      ? 'border-primary/30 bg-primary/10 text-primary'
                      : 'border-slate-700 bg-slate-800 text-slate-300 hover:border-slate-600'
                  }`}
                >
                  <span
                    className="mr-1.5 h-2 w-2 rounded-full"
                    style={{ backgroundColor: tag.color }}
                  />
                  {tag.name}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-5">
        <div>
          <label className="text-sm font-medium text-white">
            {t('broadcasts.telegram.broadcastName')}
          </label>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t('broadcasts.telegram.namePlaceholder')}
            className="mt-2 h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-primary focus:ring-1 focus:ring-primary"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-white">
            {t('broadcasts.telegram.message')}
          </label>
          <Textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder={t('broadcasts.telegram.messagePlaceholder')}
            className="mt-2 min-h-40 border-slate-700 bg-slate-950 text-white placeholder:text-slate-500"
          />
          <p className="mt-2 text-xs text-slate-500">
            {t('broadcasts.telegram.messageHint')}
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
          {t('common.back')}
        </Button>
        <Button
          onClick={handleSend}
          disabled={!canSend || sending}
          className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {sending ? t('broadcasts.telegram.sending') : t('broadcasts.telegram.send')}
        </Button>
      </div>
    </div>
  );
}
