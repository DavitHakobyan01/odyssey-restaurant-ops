/**
 * `@odyssey/shared` — framework-agnostic helpers.
 *
 * No React, no react-native, no drizzle. Pure functions only, so they can be used from a
 * screen, from the backend, or from a test without dragging anything along.
 *
 * Note the division of labour: *pricing* lives in `@odyssey/types/domain` because it is a
 * business rule the server enforces. What lives here is *presentation* — turning a value
 * that is already correct into something readable.
 */

/* -------------------------------------------------------------------------- */
/*                                    Money                                    */
/* -------------------------------------------------------------------------- */

/**
 * Format integer minor units as a currency string.
 *
 * The whole system stores money as integer cents, so every display path goes through
 * here. Division by 100 happens at the very last moment, immediately before rendering,
 * which is the only place a float is acceptable.
 */
export function formatMoney(
  cents: number,
  options: { currency?: string; locale?: string; showCents?: boolean } = {},
): string {
  const { currency = 'USD', locale = 'en-US', showCents = true } = options

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: showCents ? 2 : 0,
    maximumFractionDigits: showCents ? 2 : 0,
  }).format(cents / 100)
}

/**
 * Compact currency for KPI tiles — $12.1k rather than $12,101.61.
 *
 * Falls back to the full format below $10,000, where the exact figure is short enough to
 * read and precision is more useful than brevity.
 */
export function formatMoneyCompact(cents: number, options: { currency?: string; locale?: string } = {}) {
  const { currency = 'USD', locale = 'en-US' } = options
  if (Math.abs(cents) < 1_000_000) return formatMoney(cents, { currency, locale })

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(cents / 100)
}

/** Basis points as a percentage string. 875 -> "8.75%". */
export function formatBasisPoints(bps: number): string {
  const percent = bps / 100
  return `${Number.isInteger(percent) ? percent : percent.toFixed(2).replace(/0$/, '')}%`
}

/* -------------------------------------------------------------------------- */
/*                                    Dates                                    */
/* -------------------------------------------------------------------------- */

/**
 * Relative time for order timelines — "4m ago", "2h ago", "yesterday".
 *
 * An operations dashboard is read in terms of "how long has this been waiting", not
 * "what time was it placed", so relative is the primary format and absolute is secondary.
 */
export function formatRelativeTime(iso: string | Date, now: Date = new Date()): string {
  const date = typeof iso === 'string' ? new Date(iso) : iso
  const seconds = Math.round((now.getTime() - date.getTime()) / 1000)

  if (!Number.isFinite(seconds)) return ''
  if (seconds < 0) return 'just now'
  if (seconds < 45) return 'just now'
  if (seconds < 90) return '1m ago'

  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`

  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`

  const days = Math.round(hours / 24)
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days}d ago`

  const weeks = Math.round(days / 7)
  if (weeks < 5) return `${weeks}w ago`

  const months = Math.round(days / 30)
  if (months < 12) return `${months}mo ago`

  return `${Math.round(days / 365)}y ago`
}

export function formatDateTime(iso: string | Date, locale = 'en-US'): string {
  const date = typeof iso === 'string' ? new Date(iso) : iso
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

export function formatDate(iso: string | Date, locale = 'en-US'): string {
  const date = typeof iso === 'string' ? new Date(iso) : iso
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date)
}

export function formatTime(iso: string | Date, locale = 'en-US'): string {
  const date = typeof iso === 'string' ? new Date(iso) : iso
  return new Intl.DateTimeFormat(locale, { timeStyle: 'short' }).format(date)
}

/** Minutes as a human duration — 95 -> "1h 35m". */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return remainder === 0 ? `${hours}h` : `${hours}h ${remainder}m`
}

/** Elapsed minutes between two instants. Used for "waiting 12m" on the order queue. */
export function minutesBetween(from: string | Date, to: string | Date = new Date()): number {
  const start = typeof from === 'string' ? new Date(from) : from
  const end = typeof to === 'string' ? new Date(to) : to
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000))
}

export const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const

export const DAY_NAMES_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

/* -------------------------------------------------------------------------- */
/*                                   Numbers                                   */
/* -------------------------------------------------------------------------- */

export function formatNumber(value: number, locale = 'en-US'): string {
  return new Intl.NumberFormat(locale).format(value)
}

/** Pluralise a count — `pluralize(1, 'item')` -> "1 item". */
export function pluralize(count: number, singular: string, plural?: string): string {
  return `${formatNumber(count)} ${count === 1 ? singular : (plural ?? `${singular}s`)}`
}

/* -------------------------------------------------------------------------- */
/*                                    Text                                     */
/* -------------------------------------------------------------------------- */

export function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1).trimEnd()}…`
}

/** Initials for an avatar. "Amara Okafor" -> "AO". */
export function initials(name: string, maxLetters = 2): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, maxLetters)
    .map((part) => part.charAt(0).toUpperCase())
    .join('')
}

/* -------------------------------------------------------------------------- */
/*                                  Utilities                                  */
/* -------------------------------------------------------------------------- */

/** Percentage change between two numbers, or null when there is no meaningful baseline. */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null
  return ((current - previous) / previous) * 100
}
