type ParseRequestedAppointmentTimeInput = {
  text: string
  timezone: string
  durationMinutes: number
  now?: Date
}

type ParsedRequestedAppointmentTime = {
  scheduled_start: string
  scheduled_end: string
}

const MONTHS: Record<string, number> = {
  enero: 1,
  janeiro: 1,
  febrero: 2,
  fevereiro: 2,
  marzo: 3,
  marco: 3,
  abril: 4,
  mayo: 5,
  maio: 5,
  junio: 6,
  junho: 6,
  julio: 7,
  julho: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  setembro: 9,
  octubre: 10,
  outubro: 10,
  noviembre: 11,
  novembro: 11,
  diciembre: 12,
  dezembro: 12,
}

export function parseRequestedAppointmentTime({
  text,
  timezone,
  durationMinutes,
  now = new Date(),
}: ParseRequestedAppointmentTimeInput): ParsedRequestedAppointmentTime | null {
  const normalized = normalize(text)
  const date = extractDate(normalized, now, timezone)
  const time = extractTime(normalized)

  if (!date || !time) return null

  const start = zonedTimeToUtc({
    year: date.year,
    month: date.month,
    day: date.day,
    hour: time.hour,
    minute: time.minute,
    timezone,
  })

  const duration =
    Number.isFinite(durationMinutes) && durationMinutes > 0
      ? durationMinutes
      : 30
  const end = new Date(start.getTime() + duration * 60_000)

  return {
    scheduled_start: start.toISOString(),
    scheduled_end: end.toISOString(),
  }
}

function extractDate(normalized: string, now: Date, timezone: string) {
  const monthNames = Object.keys(MONTHS).join('|')
  const explicit = normalized.match(
    new RegExp(`\\b(?:dia\\s*)?(\\d{1,2})\\s*(?:de\\s*)?(${monthNames})\\b`),
  )

  if (explicit) {
    const day = Number(explicit[1])
    const month = MONTHS[explicit[2]]
    if (!isValidDayMonth(day, month)) return null

    let year = getZonedParts(now, timezone).year
    const candidate = zonedTimeToUtc({
      year,
      month,
      day,
      hour: 0,
      minute: 0,
      timezone,
    })

    if (candidate.getTime() < now.getTime() - 24 * 60 * 60_000) {
      year += 1
    }

    return { year, month, day }
  }

  const relativeDays = [
    { pattern: /\b(hoy|hoje)\b/, days: 0 },
    { pattern: /\b(manana|amanha)\b/, days: 1 },
  ]

  for (const item of relativeDays) {
    if (item.pattern.test(normalized)) {
      const local = getZonedParts(
        new Date(now.getTime() + item.days * 24 * 60 * 60_000),
        timezone,
      )
      return { year: local.year, month: local.month, day: local.day }
    }
  }

  return null
}

function extractTime(normalized: string) {
  const withMinutes = normalized.match(
    /\b(?:a\s+las|a\s+la|as|às|para\s+las|para\s+la)?\s*(\d{1,2})[:.](\d{2})\s*(am|pm)?\b/,
  )

  if (withMinutes) {
    return normalizeHour(Number(withMinutes[1]), Number(withMinutes[2]), withMinutes[3])
  }

  const withMarker = normalized.match(
    /\b(?:a\s+las|a\s+la|as|às|para\s+las|para\s+la)\s*(\d{1,2})\s*(am|pm|hrs?|horas?)?\b/,
  )

  if (withMarker) {
    return normalizeHour(Number(withMarker[1]), 0, withMarker[2])
  }

  return null
}

function normalizeHour(hour: number, minute: number, meridiem?: string) {
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null
  if (minute < 0 || minute > 59) return null

  let normalizedHour = hour
  if (meridiem === 'pm' && normalizedHour < 12) normalizedHour += 12
  if (meridiem === 'am' && normalizedHour === 12) normalizedHour = 0

  if (normalizedHour < 0 || normalizedHour > 23) return null
  return { hour: normalizedHour, minute }
}

function zonedTimeToUtc(input: {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  timezone: string
}) {
  const utcGuess = Date.UTC(
    input.year,
    input.month - 1,
    input.day,
    input.hour,
    input.minute,
  )
  const firstPass = new Date(
    utcGuess - getTimezoneOffsetMs(new Date(utcGuess), input.timezone),
  )
  return new Date(
    utcGuess - getTimezoneOffsetMs(firstPass, input.timezone),
  )
}

function getTimezoneOffsetMs(date: Date, timezone: string) {
  const parts = getZonedParts(date, timezone)
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  )
  return asUtc - date.getTime()
}

function getZonedParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date)

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour === '24' ? '0' : values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  }
}

function isValidDayMonth(day: number, month: number | undefined) {
  return Number.isInteger(day) && day >= 1 && day <= 31 && !!month
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
}
