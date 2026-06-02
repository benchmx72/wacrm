"use client"

import Link from 'next/link'
import { CalendarDays, CheckCircle2, Clock } from 'lucide-react'
import type { DashboardAppointment } from '@/lib/dashboard/types'
import { useLanguage } from '@/hooks/use-language'
import { type TranslationKey } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { EmptyState } from './empty-state'
import { Skeleton } from './skeleton'

interface UpcomingAppointmentsProps {
  appointments: DashboardAppointment[] | null
  loading: boolean
}

const statusTone: Record<DashboardAppointment['status'], string> = {
  proposed: 'bg-amber-500/15 text-amber-300',
  confirmed: 'bg-primary/15 text-primary',
  cancelled: 'bg-red-500/15 text-red-300',
  completed: 'bg-slate-700 text-slate-300',
}

export function UpcomingAppointments({
  appointments,
  loading,
}: UpcomingAppointmentsProps) {
  const { locale, t } = useLanguage()

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900">
      <header className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-white">
            {t('dashboard.appointments.title')}
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {t('dashboard.appointments.subtitle')}
          </p>
        </div>
        <Link
          href="/appointments"
          className="text-xs font-medium text-primary hover:text-primary/80"
        >
          {t('dashboard.appointments.viewAll')}
        </Link>
      </header>

      {loading || !appointments ? (
        <div className="space-y-3 p-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : appointments.length === 0 ? (
        <div className="p-5">
          <EmptyState
            icon={CalendarDays}
            title={t('dashboard.appointments.emptyTitle')}
            hint={t('dashboard.appointments.emptyHint')}
          />
        </div>
      ) : (
        <ul className="divide-y divide-slate-800">
          {appointments.map((appointment) => (
            <li key={appointment.id}>
              <Link
                href="/appointments"
                className="block px-5 py-3 transition-colors hover:bg-slate-800/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold text-white">
                        {appointment.title}
                      </p>
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                          statusTone[appointment.status],
                        )}
                      >
                        {t(
                          `appointments.statuses.${appointment.status}` as TranslationKey,
                        )}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-xs text-slate-400">
                      {appointment.contactName ??
                        appointment.contactPhone ??
                        t('appointments.unnamedContact')}
                    </p>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                      <Clock className="h-3.5 w-3.5" />
                      {appointment.scheduledStart
                        ? new Date(appointment.scheduledStart).toLocaleString(
                            locale,
                            { dateStyle: 'medium', timeStyle: 'short' },
                          )
                        : appointment.preferredTime ?? t('appointments.toConfirm')}
                    </p>
                  </div>
                  <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-slate-600" />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
