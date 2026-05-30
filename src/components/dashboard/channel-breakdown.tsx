"use client"

import { MessageCircle, Send } from 'lucide-react'
import { useLanguage } from '@/hooks/use-language'
import type { ChannelBreakdown as ChannelBreakdownData } from '@/lib/dashboard/types'
import { SkeletonCard } from './skeleton'

interface ChannelBreakdownProps {
  data: ChannelBreakdownData | null
  loading: boolean
}

export function ChannelBreakdown({ data, loading }: ChannelBreakdownProps) {
  const { locale, t } = useLanguage()

  if (loading || !data) return <SkeletonCard />

  const totalConversations =
    data.telegram.conversations + data.whatsapp.conversations
  const totalContacts = data.telegram.contacts + data.whatsapp.contacts

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-white">
            {t('dashboard.channels.title')}
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {t('dashboard.channels.subtitle')}
          </p>
        </div>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-slate-500">
          <MessageCircle className="h-4 w-4" />
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <ChannelRow
          label="Telegram"
          color="#22D9ED"
          conversationsLabel={t('dashboard.channels.conversations')}
          contactsLabel={t('dashboard.channels.contacts')}
          conversations={data.telegram.conversations}
          contacts={data.telegram.contacts}
          totalConversations={totalConversations}
          totalContacts={totalContacts}
          locale={locale}
        />
        <ChannelRow
          label="WhatsApp"
          color="#25D366"
          conversationsLabel={t('dashboard.channels.conversations')}
          contactsLabel={t('dashboard.channels.contacts')}
          conversations={data.whatsapp.conversations}
          contacts={data.whatsapp.contacts}
          totalConversations={totalConversations}
          totalContacts={totalContacts}
          locale={locale}
        />
      </div>
    </section>
  )
}

function ChannelRow({
  label,
  color,
  conversationsLabel,
  contactsLabel,
  conversations,
  contacts,
  totalConversations,
  totalContacts,
  locale,
}: {
  label: string
  color: string
  conversationsLabel: string
  contactsLabel: string
  conversations: number
  contacts: number
  totalConversations: number
  totalContacts: number
  locale: string
}) {
  const conversationPct = pct(conversations, totalConversations)
  const contactPct = pct(contacts, totalContacts)

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: color }}
          />
          <span className="text-sm font-semibold text-white">{label}</span>
        </div>
        <Send className="h-4 w-4 text-slate-600" />
      </div>

      <MetricLine
        label={conversationsLabel}
        value={conversations.toLocaleString(locale)}
        percent={conversationPct}
        color={color}
      />
      <MetricLine
        label={contactsLabel}
        value={contacts.toLocaleString(locale)}
        percent={contactPct}
        color={color}
      />
    </div>
  )
}

function MetricLine({
  label,
  value,
  percent,
  color,
}: {
  label: string
  value: string
  percent: number
  color: string
}) {
  return (
    <div className="mt-4">
      <div className="mb-1.5 flex items-center justify-between text-xs">
        <span className="text-slate-500">{label}</span>
        <span className="font-medium tabular-nums text-slate-300">{value}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-800">
        <div
          className="h-full rounded-full"
          style={{ width: `${percent}%`, backgroundColor: color }}
        />
      </div>
    </div>
  )
}

function pct(value: number, total: number) {
  if (total <= 0) return 0
  return Math.max(4, Math.round((value / total) * 100))
}
