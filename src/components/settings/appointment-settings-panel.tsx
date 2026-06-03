'use client'

import { useEffect, useState } from 'react'
import { CalendarDays, Loader2 } from 'lucide-react'
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
import { useLanguage } from '@/hooks/use-language'

type AppointmentSettings = {
  default_timezone: string
  default_duration_minutes: number
  default_location: string | null
  staff_notification_email: string | null
  notify_client: boolean
  notify_staff: boolean
}

const DEFAULT_SETTINGS: AppointmentSettings = {
  default_timezone: 'America/Santarem',
  default_duration_minutes: 30,
  default_location: null,
  staff_notification_email: null,
  notify_client: true,
  notify_staff: true,
}

const TIMEZONES = [
  { value: 'America/Santarem', label: 'Santarem / Para (BRT)' },
  { value: 'America/Belem', label: 'Belem / Para (BRT)' },
  { value: 'America/Sao_Paulo', label: 'Sao Paulo (BRT)' },
  { value: 'America/Mexico_City', label: 'Ciudad de Mexico' },
  { value: 'America/Bogota', label: 'Bogota / Lima / Quito' },
]

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
