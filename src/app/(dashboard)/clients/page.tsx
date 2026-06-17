'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Building2,
  Loader2,
  MailPlus,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '@/hooks/use-language';
import type { TranslationKey } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type AccountStatus = 'setup' | 'active' | 'suspended';
type MessagingChannel = 'whatsapp' | 'telegram';

interface ClientAccount {
  id: string;
  owner_user_id: string;
  name: string;
  industry: string | null;
  status: AccountStatus;
  locale: 'es-419' | 'pt-BR';
  timezone: string;
  created_at: string;
  owner: {
    user_id: string;
    full_name: string | null;
    email: string | null;
    status: string;
    messaging_channel: MessagingChannel;
  } | null;
  member_count: number;
  active_member_count: number;
}

interface AccountForm {
  name: string;
  industry: string;
  status: AccountStatus;
  locale: 'es-419' | 'pt-BR';
  timezone: string;
  messaging_channel: MessagingChannel;
}

interface NewAccountForm extends AccountForm {
  admin_name: string;
  admin_email: string;
}

const initialNewAccountForm: NewAccountForm = {
  name: '',
  industry: '',
  status: 'setup',
  locale: 'es-419',
  timezone: 'America/Santarem',
  messaging_channel: 'whatsapp',
  admin_name: '',
  admin_email: '',
};

const statusClasses: Record<AccountStatus, string> = {
  active: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  setup: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  suspended: 'border-red-500/30 bg-red-500/10 text-red-300',
};

const statusTranslationKeys: Record<AccountStatus, TranslationKey> = {
  active: 'clients.statuses.active',
  setup: 'clients.statuses.setup',
  suspended: 'clients.statuses.suspended',
};

export default function ClientsPage() {
  const { locale, t } = useLanguage();
  const [accounts, setAccounts] = useState<ClientAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingAccount, setEditingAccount] = useState<ClientAccount | null>(
    null
  );
  const [form, setForm] = useState<AccountForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newAccount, setNewAccount] = useState<NewAccountForm>(
    initialNewAccountForm
  );
  const [creating, setCreating] = useState(false);
  const [resendingAccountId, setResendingAccountId] = useState<string | null>(
    null
  );

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/admin/accounts', {
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.error || t('clients.loadError'));
      }

      setAccounts(payload?.accounts ?? []);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : t('clients.loadError')
      );
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  const totals = useMemo(
    () => ({
      total: accounts.length,
      active: accounts.filter((account) => account.status === 'active').length,
      setup: accounts.filter((account) => account.status === 'setup').length,
      suspended: accounts.filter((account) => account.status === 'suspended')
        .length,
    }),
    [accounts]
  );

  const metrics = [
    { label: t('clients.summary.total'), value: totals.total },
    { label: t('clients.summary.active'), value: totals.active },
    { label: t('clients.summary.setup'), value: totals.setup },
    { label: t('clients.summary.suspended'), value: totals.suspended },
  ];

  function openEditor(account: ClientAccount) {
    setEditingAccount(account);
    setForm({
      name: account.name,
      industry: account.industry ?? '',
      status: account.status,
      locale: account.locale,
      timezone: account.timezone,
      messaging_channel:
        account.owner?.messaging_channel ?? ('whatsapp' as MessagingChannel),
    });
  }

  function closeEditor() {
    if (saving) return;
    setEditingAccount(null);
    setForm(null);
  }

  async function saveAccount() {
    if (!editingAccount || !form) return;

    setSaving(true);
    try {
      const response = await fetch('/api/admin/accounts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingAccount.id,
          ...form,
        }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.error || t('clients.editor.saveError'));
      }

      setAccounts((current) =>
        current.map((account) =>
          account.id === editingAccount.id
            ? {
                ...account,
                name: form.name.trim(),
                industry: form.industry.trim() || null,
                status: form.status,
                locale: form.locale,
                timezone: form.timezone,
                owner: account.owner
                  ? {
                      ...account.owner,
                      messaging_channel: form.messaging_channel,
                    }
                  : null,
              }
            : account
        )
      );
      toast.success(t('clients.editor.saved'));
      setEditingAccount(null);
      setForm(null);
    } catch (saveError) {
      toast.error(
        saveError instanceof Error
          ? saveError.message
          : t('clients.editor.saveError')
      );
    } finally {
      setSaving(false);
    }
  }

  async function createAccount() {
    setCreating(true);

    try {
      const response = await fetch('/api/admin/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newAccount),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.error || t('clients.creator.createError'));
      }

      setAccounts((current) => [payload.account, ...current]);
      setNewAccount(initialNewAccountForm);
      setCreateOpen(false);
      toast.success(t('clients.creator.created'));
    } catch (createError) {
      toast.error(
        createError instanceof Error
          ? createError.message
          : t('clients.creator.createError')
      );
    } finally {
      setCreating(false);
    }
  }

  async function resendInvitation(account: ClientAccount) {
    if (resendingAccountId) return;

    setResendingAccountId(account.id);
    try {
      const response = await fetch('/api/admin/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'resend_invitation',
          account_id: account.id,
        }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          payload?.error || t('clients.editor.invitationResendError')
        );
      }

      if (typeof payload?.invitation_link === 'string') {
        await navigator.clipboard
          ?.writeText(payload.invitation_link)
          .catch(() => undefined);
        toast.success(t('clients.editor.invitationLinkCopied'));
      } else {
        toast.success(t('clients.editor.invitationResent'));
      }
    } catch (resendError) {
      toast.error(
        resendError instanceof Error
          ? resendError.message
          : t('clients.editor.invitationResendError')
      );
    } finally {
      setResendingAccountId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">
            {t('clients.title')}
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            {t('clients.description')}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => void loadAccounts()}
            disabled={loading}
          >
            {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            {t('clients.refresh')}
          </Button>
          <Button type="button" onClick={() => setCreateOpen(true)}>
            <Plus />
            {t('clients.creator.action')}
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <div
            key={metric.label}
            className="rounded-lg border border-slate-800 bg-slate-900/60 p-4"
          >
            <p className="text-xs font-medium text-slate-400 uppercase">
              {metric.label}
            </p>
            <p className="mt-2 text-2xl font-bold text-white">{metric.value}</p>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-900/40">
        {loading ? (
          <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('clients.loading')}
          </div>
        ) : error ? (
          <div className="flex min-h-64 flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="text-sm text-red-300">{error}</p>
            <Button
              type="button"
              variant="outline"
              onClick={() => void loadAccounts()}
            >
              <RefreshCw />
              {t('clients.retry')}
            </Button>
          </div>
        ) : accounts.length === 0 ? (
          <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-center">
            <Building2 className="h-9 w-9 text-slate-600" />
            <p className="text-sm text-slate-400">{t('clients.empty')}</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-slate-800 hover:bg-transparent">
                <TableHead className="px-4 text-slate-400">
                  {t('clients.table.account')}
                </TableHead>
                <TableHead className="text-slate-400">
                  {t('clients.table.admin')}
                </TableHead>
                <TableHead className="text-slate-400">
                  {t('clients.table.channel')}
                </TableHead>
                <TableHead className="text-slate-400">
                  {t('clients.table.team')}
                </TableHead>
                <TableHead className="text-slate-400">
                  {t('clients.table.status')}
                </TableHead>
                <TableHead className="pr-4 text-slate-400">
                  {t('clients.table.created')}
                </TableHead>
                <TableHead className="pr-4 text-right text-slate-400">
                  {t('clients.table.actions')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((account) => (
                <TableRow key={account.id} className="border-slate-800">
                  <TableCell className="px-4">
                    <div className="min-w-48">
                      <p className="font-medium text-white">{account.name}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {account.industry || account.timezone}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="min-w-48">
                      <p className="text-slate-200">
                        {account.owner?.full_name || t('clients.noAdmin')}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {account.owner?.email || ''}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className="border-slate-700 text-slate-300"
                    >
                      {account.owner?.messaging_channel === 'telegram'
                        ? t('clients.channels.telegram')
                        : t('clients.channels.whatsapp')}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 text-slate-300">
                      <Users className="h-4 w-4 text-slate-500" />
                      {t('clients.members', { count: account.member_count })}
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {t('clients.activeMembers', {
                        count: account.active_member_count,
                      })}
                    </p>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={statusClasses[account.status]}
                    >
                      {t(statusTranslationKeys[account.status])}
                    </Badge>
                  </TableCell>
                  <TableCell className="pr-4 text-slate-400">
                    {new Intl.DateTimeFormat(locale, {
                      dateStyle: 'medium',
                    }).format(new Date(account.created_at))}
                  </TableCell>
                  <TableCell className="pr-4 text-right">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => openEditor(account)}
                    >
                      <Pencil />
                      {t('clients.edit')}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog
        open={Boolean(editingAccount && form)}
        onOpenChange={(open) => {
          if (!open) closeEditor();
        }}
      >
        <DialogContent className="border-slate-700 bg-slate-900 sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-white">
              {t('clients.editor.title')}
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              {t('clients.editor.description')}
            </DialogDescription>
          </DialogHeader>

          {editingAccount && form ? (
            <div className="grid gap-4 py-1 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="client-name">{t('clients.editor.name')}</Label>
                <Input
                  id="client-name"
                  value={form.name}
                  maxLength={120}
                  onChange={(event) =>
                    setForm({ ...form, name: event.target.value })
                  }
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="client-industry">
                  {t('clients.editor.industry')}
                </Label>
                <Input
                  id="client-industry"
                  value={form.industry}
                  maxLength={120}
                  placeholder={t('clients.editor.industryPlaceholder')}
                  onChange={(event) =>
                    setForm({ ...form, industry: event.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>{t('clients.editor.status')}</Label>
                <Select
                  value={form.status}
                  onValueChange={(value) =>
                    setForm({ ...form, status: value as AccountStatus })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACCOUNT_STATUS_OPTIONS.map((status) => (
                      <SelectItem key={status} value={status}>
                        {t(statusTranslationKeys[status])}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{t('clients.editor.channel')}</Label>
                <Select
                  value={form.messaging_channel}
                  onValueChange={(value) =>
                    setForm({
                      ...form,
                      messaging_channel: value as MessagingChannel,
                    })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="whatsapp">
                      {t('clients.channels.whatsapp')}
                    </SelectItem>
                    <SelectItem value="telegram">
                      {t('clients.channels.telegram')}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{t('clients.editor.locale')}</Label>
                <Select
                  value={form.locale}
                  onValueChange={(value) =>
                    setForm({
                      ...form,
                      locale: value as AccountForm['locale'],
                    })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="es-419">
                      {t('clients.locales.spanish')}
                    </SelectItem>
                    <SelectItem value="pt-BR">
                      {t('clients.locales.portuguese')}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="client-timezone">
                  {t('clients.editor.timezone')}
                </Label>
                <Input
                  id="client-timezone"
                  value={form.timezone}
                  placeholder="America/Santarem"
                  onChange={(event) =>
                    setForm({ ...form, timezone: event.target.value })
                  }
                />
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3 sm:col-span-2">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-medium text-slate-400">
                      {t('clients.editor.admin')}
                    </p>
                    <p className="mt-1 text-sm text-slate-200">
                      {editingAccount.owner?.full_name || t('clients.noAdmin')}
                    </p>
                    <p className="text-xs text-slate-500">
                      {editingAccount.owner?.email || ''}
                    </p>
                  </div>
                  {editingAccount.owner?.status === 'invited' ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={resendingAccountId === editingAccount.id}
                      onClick={() => void resendInvitation(editingAccount)}
                    >
                      {resendingAccountId === editingAccount.id ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <MailPlus />
                      )}
                      {resendingAccountId === editingAccount.id
                        ? t('clients.editor.resendingInvitation')
                        : t('clients.editor.resendInvitation')}
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          <DialogFooter className="border-slate-700 bg-slate-950/40">
            <Button
              type="button"
              variant="outline"
              onClick={closeEditor}
              disabled={saving}
            >
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              onClick={() => void saveAccount()}
              disabled={saving || !form?.name.trim() || !form?.timezone.trim()}
            >
              {saving ? <Loader2 className="animate-spin" /> : <Save />}
              {saving ? t('common.saving') : t('clients.editor.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          if (!creating) setCreateOpen(open);
        }}
      >
        <DialogContent className="border-slate-700 bg-slate-900 sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-white">
              {t('clients.creator.title')}
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              {t('clients.creator.description')}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-1 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="new-client-name">
                {t('clients.editor.name')}
              </Label>
              <Input
                id="new-client-name"
                value={newAccount.name}
                maxLength={120}
                onChange={(event) =>
                  setNewAccount({ ...newAccount, name: event.target.value })
                }
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="new-client-industry">
                {t('clients.editor.industry')}
              </Label>
              <Input
                id="new-client-industry"
                value={newAccount.industry}
                maxLength={120}
                placeholder={t('clients.editor.industryPlaceholder')}
                onChange={(event) =>
                  setNewAccount({
                    ...newAccount,
                    industry: event.target.value,
                  })
                }
              />
            </div>

            <div className="space-y-2">
              <Label>{t('clients.editor.channel')}</Label>
              <Select
                value={newAccount.messaging_channel}
                onValueChange={(value) =>
                  setNewAccount({
                    ...newAccount,
                    messaging_channel: value as MessagingChannel,
                  })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="whatsapp">
                    {t('clients.channels.whatsapp')}
                  </SelectItem>
                  <SelectItem value="telegram">
                    {t('clients.channels.telegram')}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{t('clients.editor.status')}</Label>
              <Select
                value={newAccount.status}
                onValueChange={(value) =>
                  setNewAccount({
                    ...newAccount,
                    status: value as AccountStatus,
                  })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACCOUNT_STATUS_OPTIONS.map((status) => (
                    <SelectItem key={status} value={status}>
                      {t(statusTranslationKeys[status])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{t('clients.editor.locale')}</Label>
              <Select
                value={newAccount.locale}
                onValueChange={(value) =>
                  setNewAccount({
                    ...newAccount,
                    locale: value as NewAccountForm['locale'],
                  })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="es-419">
                    {t('clients.locales.spanish')}
                  </SelectItem>
                  <SelectItem value="pt-BR">
                    {t('clients.locales.portuguese')}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-client-timezone">
                {t('clients.editor.timezone')}
              </Label>
              <Input
                id="new-client-timezone"
                value={newAccount.timezone}
                placeholder="America/Santarem"
                onChange={(event) =>
                  setNewAccount({
                    ...newAccount,
                    timezone: event.target.value,
                  })
                }
              />
            </div>

            <div className="border-t border-slate-800 pt-4 sm:col-span-2">
              <p className="text-sm font-medium text-white">
                {t('clients.creator.adminSection')}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {t('clients.creator.adminDescription')}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-client-admin-name">
                {t('clients.creator.adminName')}
              </Label>
              <Input
                id="new-client-admin-name"
                value={newAccount.admin_name}
                maxLength={120}
                onChange={(event) =>
                  setNewAccount({
                    ...newAccount,
                    admin_name: event.target.value,
                  })
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-client-admin-email">
                {t('clients.creator.adminEmail')}
              </Label>
              <Input
                id="new-client-admin-email"
                type="email"
                value={newAccount.admin_email}
                onChange={(event) =>
                  setNewAccount({
                    ...newAccount,
                    admin_email: event.target.value,
                  })
                }
              />
            </div>
          </div>

          <DialogFooter className="border-slate-700 bg-slate-950/40">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreateOpen(false)}
              disabled={creating}
            >
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              onClick={() => void createAccount()}
              disabled={
                creating ||
                !newAccount.name.trim() ||
                !newAccount.timezone.trim() ||
                !newAccount.admin_name.trim() ||
                !newAccount.admin_email.trim()
              }
            >
              {creating ? <Loader2 className="animate-spin" /> : <Plus />}
              {creating
                ? t('clients.creator.creating')
                : t('clients.creator.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const ACCOUNT_STATUS_OPTIONS: AccountStatus[] = [
  'setup',
  'active',
  'suspended',
];
