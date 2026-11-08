// Admin pages render on the server, whose own clock zone (usually UTC) says
// nothing about the household. Every date the console shows goes through
// these helpers with the household's IANA time zone instead.

export const DEFAULT_TIME_ZONE = 'UTC'

/** The canonical IANA name for `value`, or null when it isn't a time zone. */
export function canonicalTimeZone(value: unknown) {
  if (typeof value !== 'string') {
    return null
  }

  let trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: trimmed }).resolvedOptions().timeZone
  } catch {
    return null
  }
}

/** Every zone the runtime knows, UTC first, always including `current`. */
export function timeZoneChoices(current: string) {
  let zones = new Set([...Intl.supportedValuesOf('timeZone'), current])
  zones.delete(DEFAULT_TIME_ZONE)
  return [DEFAULT_TIME_ZONE, ...[...zones].sort()]
}

/** The `YYYY-MM-DD` calendar day `date` falls on in `timeZone`. */
export function calendarDayKey(date: Date, timeZone: string) {
  let parts = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: '2-digit',
    timeZone,
    year: 'numeric',
  }).formatToParts(date)
  let part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

/** The calendar day before a `YYYY-MM-DD` key. Pure date math, so DST can't skew it. */
export function previousDayKey(key: string) {
  let [year, month, day] = key.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day - 1)).toISOString().slice(0, 10)
}

export function formatDateTime(value: string | number | Date, timeZone: string) {
  return new Date(value).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone,
  })
}

export function formatClockTime(value: string | number | Date, timeZone: string) {
  return new Date(value).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  })
}

export function formatWeekday(date: Date, timeZone: string) {
  return date.toLocaleDateString('en-US', { timeZone, weekday: 'long' })
}

export function formatMonthDay(date: Date, timeZone: string, withYear: boolean) {
  return date.toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    timeZone,
    year: withYear ? 'numeric' : undefined,
  })
}
