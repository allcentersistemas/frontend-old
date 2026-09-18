/** Zona horaria de la operación (Perú). */
export const APP_TIMEZONE = 'America/Lima'

const NAIVE_ISO =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?$/

/**
 * Fechas del backend Java (LocalDateTime) llegan sin zona; se interpretan como hora de Lima.
 */
export function parseAppDateTime(value) {
  if (value == null || value === '') return null
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }
  // Jackson a veces serializa LocalDateTime como [y, m, d, h, mi, s]
  if (Array.isArray(value) && value.length >= 5) {
    const [y, mo, d, h, mi, se = 0] = value.map(Number)
    if (![y, mo, d, h, mi, se].every((n) => Number.isFinite(n))) return null
    const withOffset = `${String(y).padStart(4, '0')}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}T${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}:${String(se).padStart(2, '0')}-05:00`
    const parsed = new Date(withOffset)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  const raw = String(value).trim()
  if (!raw) return null
  if (/[Zz]$|[+-]\d{2}:?\d{2}$/.test(raw)) {
    const d = new Date(raw)
    return Number.isNaN(d.getTime()) ? null : d
  }
  const m = raw.replace(' ', 'T').match(NAIVE_ISO)
  if (m) {
    const [, y, mo, d, h, mi, se = '0'] = m
    const withOffset = `${y}-${mo}-${d}T${h}:${mi}:${se.padStart(2, '0')}-05:00`
    const parsed = new Date(withOffset)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  const fallback = new Date(raw)
  return Number.isNaN(fallback.getTime()) ? null : fallback
}

export function formatAppDateTime(value, options = {}) {
  const date = parseAppDateTime(value)
  if (!date) return '—'
  try {
    return new Intl.DateTimeFormat('es-PE', {
      timeZone: APP_TIMEZONE,
      dateStyle: options.dateStyle ?? 'medium',
      timeStyle: options.timeStyle ?? 'short',
      ...options,
    }).format(date)
  } catch {
    return String(value)
  }
}

function limaCalendarDayKey(date) {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: APP_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date)
  } catch {
    return null
  }
}

/**
 * Tiempo relativo en español: "hace 5 minutos", "hace 2 horas", "ayer", etc.
 */
export function formatRelativeTimeEs(value, now = new Date()) {
  const date = parseAppDateTime(value)
  if (!date) return ''
  const diffMs = now.getTime() - date.getTime()
  if (!Number.isFinite(diffMs)) return ''
  if (diffMs < 0) return 'hace un momento'

  const sec = Math.floor(diffMs / 1000)
  if (sec < 45) return 'hace un momento'
  const min = Math.floor(sec / 60)
  if (min < 60) return min === 1 ? 'hace 1 minuto' : `hace ${min} minutos`
  const hours = Math.floor(min / 60)
  if (hours < 24) return hours === 1 ? 'hace 1 hora' : `hace ${hours} horas`

  const todayKey = limaCalendarDayKey(now)
  const dateKey = limaCalendarDayKey(date)
  if (todayKey && dateKey) {
    const today = new Date(`${todayKey}T12:00:00-05:00`)
    const day = new Date(`${dateKey}T12:00:00-05:00`)
    const dayDiff = Math.round((today.getTime() - day.getTime()) / 86_400_000)
    if (dayDiff === 1) return 'ayer'
    if (dayDiff > 1 && dayDiff < 7) return `hace ${dayDiff} días`
  }

  const days = Math.floor(hours / 24)
  if (days === 1) return 'ayer'
  if (days < 7) return `hace ${days} días`
  return formatAppDateTime(value, { dateStyle: 'medium', timeStyle: undefined })
}

/**
 * Día calendario en Lima como yyyy-MM-dd.
 */
export function limaTodayIso(now = new Date()) {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: APP_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now)
  } catch {
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    const d = String(now.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
}

/**
 * Duración en el estado actual: "12m", "3h 20m", "2d 4h".
 * @param {string|number|Date|Array|null|undefined} since
 * @param {Date} [now]
 */
export function formatDurationInEstado(since, now = new Date()) {
  const date = parseAppDateTime(since)
  if (!date) return ''
  let ms = now.getTime() - date.getTime()
  if (!Number.isFinite(ms) || ms < 0) ms = 0
  const totalMin = Math.floor(ms / 60_000)
  if (totalMin < 1) return '<1m'
  if (totalMin < 60) return `${totalMin}m`
  const days = Math.floor(totalMin / (60 * 24))
  const hours = Math.floor((totalMin % (60 * 24)) / 60)
  const mins = totalMin % 60
  if (days > 0) {
    return hours > 0 ? `${days}d ${hours}h` : `${days}d`
  }
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
}
