'use client'

import { useEffect, useState } from 'react'
import { CalendarDays, Clock, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useLanguage } from '@/hooks/use-language'

type AppointmentSettings = {
  default_timezone: string
  default_duration_minutes: number
  default_location: string | null
  staff_notification_email: string | null
  notify_client: boolean
  notify_staff: boolean
  reminder_24h_enabled: boolean
  reminder_2h_enabled: boolean
  reminder_channel_enabled: boolean
  availability_days: number[]
  availability_start_time: string
  availability_end_time: string
  buffer_minutes: number
  no_availability_message: string | null
}

const DEFAULT_SETTINGS: AppointmentSettings = {
  default_timezone: 'America/Santarem',
  default_duration_minutes: 30,
  default_location: null,
  staff_notification_email: null,
  notify_client: true,
  notify_staff: true,
  reminder_24h_enabled: true,
  reminder_2h_enabled: true,
  reminder_channel_enabled: true,
  availability_days: [1, 2, 3, 4, 5],
  availability_start_time: '09:00',
  availability_end_time: '17:00',
  buffer_minutes: 0,
  no_availability_message: null,
}

const TIMEZONES = [
  { value: 'America/Santarem', label: 'Santarem / Para (BRT)' },
  { value: 'America/Belem', label: 'Belem / Para (BRT)' },
  { value: 'America/Sao_Paulo', label: 'Sao Paulo (BRT)' },
  { value: 'America/Mexico_City', label: 'Ciudad de Mexico' },
  { value: 'America/Bogota', label: 'Bogota / Lima / Quito' },
]

const WEEK_DAYS = [
  { value: 1, key: 'monday' },
  { value: 2, key: 'tuesday' },
  { value: 3, key: 'wednesday' },
  { value: 4, key: 'thursday' },
  { value: 5, key: 'friday' },
  { value: 6, key: 'saturday' },
  { value: 0, key: 'sunday' },
] as const

export function AppointmentSettingsPanel() {
  const { t } = useLanguage()
  const [settings, setSettings] =
    useState<AppointmentSettings>(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function loadSettings() {
      try {
        const response = await fetch('/api/appointments/settings')
        const payload = await response.json().catch(() => null)

        if (!response.ok) {
          throw new Error(payload?.error ?? 'Failed to load settings')
        }

        if (!cancelled && payload?.settings) {
          setSettings(payload.settings)
        }
      } catch (error) {
        console.error('Appointment settings load error:', error)
        toast.error(t('settings.appointments.failedLoad'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadSettings()

    return () => {
      cancelled = true
    }
  }, [t])

  async function handleSave() {
    try {
      setSaving(true)
      const response = await fetch('/api/appointments/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      const payload = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(payload?.error ?? 'Failed to save settings')
      }

      if (payload?.settings) setSettings(payload.settings)
      toast.success(t('settings.appointments.saved'))
    } catch (error) {
      console.error('Appointment settings save error:', error)
      toast.error(t('settings.appointments.failedSave'))
    } finally {
      setSaving(false)
    }
  }

  function toggleAvailabilityDay(day: number) {
    setSettings((current) => {
      const hasDay = current.availability_days.includes(day)
      const nextDays = hasDay
        ? current.availability_days.filter((value) => value !== day)
        : [...current.availability_days, day]

      return {
        ...current,
        availability_days: nextDays.sort((a, b) => a - b),
      }
    })
  }

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <Card className="bg-slate-900 border-slate-700">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-white">
          <CalendarDays className="size-4 text-primary" />
          {t('settings.appointments.title')}
        </CardTitle>
        <CardDescription className="text-slate-400">
          {t('settings.appointments.description')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-slate-300">
              {t('settings.appointments.defaultTimezone')}
            </Label>
            <Select
              value={settings.default_timezone}
              onValueChange={(value) =>
                setSettings((current) => ({
                  ...current,
                  default_timezone: value ?? DEFAULT_SETTINGS.default_timezone,
                }))
              }
            >
              <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                {TIMEZONES.map((timezone) => (
                  <SelectItem
                    key={timezone.value}
                    value={timezone.value}
                    className="text-white focus:bg-slate-700 focus:text-white"
                  >
                    {timezone.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-slate-300">
              {t('settings.appointments.defaultDuration')}
            </Label>
            <Input
              type="number"
              min={5}
              max={480}
              step={5}
              value={settings.default_duration_minutes}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  default_duration_minutes: Number(event.target.value),
                }))
              }
              className="bg-slate-800 border-slate-700 text-white"
            />
            <p className="text-xs text-slate-500">
              {t('settings.appointments.defaultDurationHint')}
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-slate-300">
              {t('settings.appointments.defaultLocation')}
            </Label>
            <Input
              value={settings.default_location ?? ''}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  default_location: event.target.value,
                }))
              }
              placeholder={t('settings.appointments.defaultLocationPlaceholder')}
              className="bg-slate-800 border-slate-700 text-white"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-slate-300">
              {t('settings.appointments.staffEmail')}
            </Label>
            <Input
              type="email"
              value={settings.staff_notification_email ?? ''}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  staff_notification_email: event.target.value,
                }))
              }
              placeholder={t('settings.appointments.staffEmailPlaceholder')}
              className="bg-slate-800 border-slate-700 text-white"
            />
            <p className="text-xs text-slate-500">
              {t('settings.appointments.staffEmailHint')}
            </p>
          </div>
        </div>

        <div className="space-y-4 rounded-lg border border-slate-700 bg-slate-950/40 p-4">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
              <Clock className="size-4 text-primary" />
              {t('settings.appointments.availabilityTitle')}
            </h3>
            <p className="text-xs text-slate-400">
              {t('settings.appointments.availabilityDescription')}
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-slate-300">
              {t('settings.appointments.availabilityDays')}
            </Label>
            <div className="flex flex-wrap gap-2">
              {WEEK_DAYS.map((day) => {
                const active = settings.availability_days.includes(day.value)
                return (
                  <Button
                    key={day.value}
                    type="button"
                    variant={active ? 'default' : 'outline'}
                    onClick={() => toggleAvailabilityDay(day.value)}
                    className={
                      active
                        ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                        : 'border-slate-700 bg-slate-950/40 text-slate-300 hover:bg-slate-800 hover:text-white'
                    }
                  >
                    {t(`settings.appointments.days.${day.key}`)}
                  </Button>
                )
              })}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label className="text-slate-300">
                {t('settings.appointments.availabilityStart')}
              </Label>
              <Input
                type="time"
                value={settings.availability_start_time}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    availability_start_time: event.target.value,
                  }))
                }
                className="bg-slate-800 border-slate-700 text-white"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-slate-300">
                {t('settings.appointments.availabilityEnd')}
              </Label>
              <Input
                type="time"
                value={settings.availability_end_time}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    availability_end_time: event.target.value,
                  }))
                }
                className="bg-slate-800 border-slate-700 text-white"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-slate-300">
                {t('settings.appointments.bufferMinutes')}
              </Label>
              <Input
                type="number"
                min={0}
                max={240}
                step={5}
                value={settings.buffer_minutes}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    buffer_minutes: Number(event.target.value),
                  }))
                }
                className="bg-slate-800 border-slate-700 text-white"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-slate-300">
              {t('settings.appointments.noAvailabilityMessage')}
            </Label>
            <Textarea
              value={settings.no_availability_message ?? ''}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  no_availability_message: event.target.value,
                }))
              }
              placeholder={t('settings.appointments.noAvailabilityPlaceholder')}
              className="min-h-20 bg-slate-800 border-slate-700 text-white"
            />
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="flex items-start gap-3 rounded-lg border border-slate-700 bg-slate-950/40 p-4">
            <Switch
              checked={settings.notify_client}
              onCheckedChange={(checked) =>
                setSettings((current) => ({
                  ...current,
                  notify_client: checked,
                }))
              }
            />
            <span>
              <span className="block text-sm font-medium text-white">
                {t('settings.appointments.notifyClient')}
              </span>
              <span className="block text-xs text-slate-400">
                {t('settings.appointments.notifyClientHint')}
              </span>
            </span>
          </label>

          <label className="flex items-start gap-3 rounded-lg border border-slate-700 bg-slate-950/40 p-4">
            <Switch
              checked={settings.notify_staff}
              onCheckedChange={(checked) =>
                setSettings((current) => ({
                  ...current,
                  notify_staff: checked,
                }))
              }
            />
            <span>
              <span className="block text-sm font-medium text-white">
                {t('settings.appointments.notifyStaff')}
              </span>
              <span className="block text-xs text-slate-400">
                {t('settings.appointments.notifyStaffHint')}
              </span>
            </span>
          </label>
        </div>

        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-white">
              {t('settings.appointments.remindersTitle')}
            </h3>
            <p className="text-xs text-slate-400">
              {t('settings.appointments.remindersDescription')}
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {[
              {
                key: 'reminder_24h_enabled' as const,
                label: t('settings.appointments.reminder24h'),
                hint: t('settings.appointments.reminder24hHint'),
              },
              {
                key: 'reminder_2h_enabled' as const,
                label: t('settings.appointments.reminder2h'),
                hint: t('settings.appointments.reminder2hHint'),
              },
              {
                key: 'reminder_channel_enabled' as const,
                label: t('settings.appointments.reminderChannel'),
                hint: t('settings.appointments.reminderChannelHint'),
              },
            ].map((option) => (
              <label
                key={option.key}
                className="flex items-start gap-3 rounded-lg border border-slate-700 bg-slate-950/40 p-4"
              >
                <Switch
                  checked={settings[option.key]}
                  onCheckedChange={(checked) =>
                    setSettings((current) => ({
                      ...current,
                      [option.key]: checked,
                    }))
                  }
                />
                <span>
                  <span className="block text-sm font-medium text-white">
                    {option.label}
                  </span>
                  <span className="block text-xs text-slate-400">
                    {option.hint}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </div>

        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-primary hover:bg-primary/90 text-primary-foreground"
        >
          {saving ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              {t('common.saving')}
            </>
          ) : (
            t('settings.appointments.save')
          )}
        </Button>
      </CardContent>
    </Card>
  )
}
