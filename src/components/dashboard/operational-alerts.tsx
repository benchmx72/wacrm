"use client"

import Link from 'next/link'
import { CalendarClock, CheckCircle2, MailWarning, ShieldCheck } from 'lucide-react'
import type { ComponentType } from 'react'
import type { OperationalAlert, OperationalAlertKind } from '@/lib/dashboard/types'
import { useLanguage } from '@/hooks/use-language'
import { cn } from '@/lib/utils'
import { EmptyState } from './empty-state'
import { Skeleton } from './skeleton'

interface OperationalAlertsProps {
  alerts: OperationalAlert[] | null
  loading: boolean
}

interface AlertTheme {
  icon: ComponentType<{ className?: string }>
  badge: string
}

const ALERT_THEME: Record<OperationalAlertKind, AlertTheme> = {
  appointment_request: {
    icon: CalendarClock,
    badge: 'bg-amber-500/10 text-amber-300',
  },
  notification_failed: {
    icon: MailWarning,
    badge: 'bg-red-500/10 text-red-300',
  },
}

export function OperationalAlerts({ alerts, loading }: OperationalAlertsProps) {
  const { locale, t } = useLanguage()

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900">
      <header className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-white">
            {t('dashboard.operational.title')}
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {t('dashboard.operational.subtitle')}
          </p>
        </div>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-primary">
          <ShieldCheck className="h-4 w-4" />
        </div>
      </header>

      {loading || !alerts ? (
        <div className="space-y-2 p-5">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : alerts.length === 0 ? (
        <div className="p-5">
          <EmptyState
            icon={CheckCircle2}
            title={t('dashboard.operational.emptyTitle')}
            hint={t('dashboard.operational.emptyHint')}
            className="min-h-28"
          />
        </div>
      ) : (
        <ul className="divide-y divide-slate-800">
          {alerts.map((alert) => {
            const theme = ALERT_THEME[alert.kind]
            const Icon = theme.icon
            const title =
              alert.kind === 'appointment_request'
                ? t('dashboard.operational.appointmentRequest')
                : t('dashboard.operational.notificationFailed')

            return (
              <li key={alert.id}>
                <Link
                  href={alert.href}
                  className="block px-5 py-3 transition-colors hover:bg-slate-800/40"
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={cn(
                        'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                        theme.badge,
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-semibold text-white">{title}</p>
                        <time className="shrink-0 text-xs text-slate-500 tabular-nums">
                          {relativeTime(alert.at, locale, t)}
                        </time>
                      </div>
                      <p className="mt-1 truncate text-xs text-slate-400">
                        {alert.title || alert.primary || t('dashboard.operational.withoutTitle')}
                      </p>
                      {alert.detail && (
                        <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                          {alert.detail}
                        </p>
                      )}
                    </div>
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function relativeTime(
  iso: string,
  locale: string,
  t: ReturnType<typeof useLanguage>['t'],
): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const diffSec = Math.round((Date.now() - then) / 1000)
  if (diffSec < 60) return t('dashboard.activity.secondsAgo', { count: Math.max(1, diffSec) })
  if (diffSec < 3600) return t('dashboard.activity.minutesAgo', { count: Math.floor(diffSec / 60) })
  if (diffSec < 86400) return t('dashboard.activity.hoursAgo', { count: Math.floor(diffSec / 3600) })
  if (diffSec < 2_592_000) return t('dashboard.activity.daysAgo', { count: Math.floor(diffSec / 86400) })
  return new Date(iso).toLocaleDateString(locale)
}
