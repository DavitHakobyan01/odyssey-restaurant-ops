/**
 * Formatting tests.
 *
 * These matter more than they look: every money figure the operator reads passes through
 * `formatMoney`, and the integer-cents contract only holds if the division by 100 happens
 * here and nowhere else.
 */
import { describe, expect, it } from 'vitest'

import {
  formatBasisPoints,
  formatDuration,
  formatMoney,
  formatMoneyCompact,
  formatRelativeTime,
  initials,
  minutesBetween,
  percentChange,
  pluralize,
  truncate,
} from './index'

describe('formatMoney', () => {
  it('renders integer cents as currency', () => {
    expect(formatMoney(1234)).toBe('$12.34')
  })

  it('keeps trailing zeros so columns align', () => {
    expect(formatMoney(1200)).toBe('$12.00')
    expect(formatMoney(0)).toBe('$0.00')
  })

  it('groups thousands', () => {
    expect(formatMoney(1_234_567)).toBe('$12,345.67')
  })

  it('handles negative amounts', () => {
    expect(formatMoney(-500)).toBe('-$5.00')
  })

  it('does not round away a cent', () => {
    // The classic float trap: 1010 / 100 must not render as $10.09.
    expect(formatMoney(1010)).toBe('$10.10')
    expect(formatMoney(999)).toBe('$9.99')
  })

  it('respects a different currency', () => {
    expect(formatMoney(1500, { currency: 'EUR', locale: 'en-US' })).toBe('€15.00')
  })
})

describe('formatMoneyCompact', () => {
  it('stays exact below the compact threshold', () => {
    expect(formatMoneyCompact(999_999)).toBe('$9,999.99')
  })

  it('compacts large figures for KPI tiles', () => {
    expect(formatMoneyCompact(1_210_161)).toBe('$12.1K')
  })
})

describe('formatBasisPoints', () => {
  it('converts basis points to a percentage', () => {
    expect(formatBasisPoints(875)).toBe('8.75%')
  })

  it('renders whole percentages without decimals', () => {
    expect(formatBasisPoints(500)).toBe('5%')
    expect(formatBasisPoints(0)).toBe('0%')
    expect(formatBasisPoints(10_000)).toBe('100%')
  })
})

describe('formatRelativeTime', () => {
  const now = new Date('2026-08-12T12:00:00.000Z')
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString()

  it('describes very recent instants as just now', () => {
    expect(formatRelativeTime(ago(5_000), now)).toBe('just now')
  })

  it('describes minutes, hours and days', () => {
    expect(formatRelativeTime(ago(4 * 60_000), now)).toBe('4m ago')
    expect(formatRelativeTime(ago(3 * 3_600_000), now)).toBe('3h ago')
    expect(formatRelativeTime(ago(3 * 86_400_000), now)).toBe('3d ago')
  })

  it('uses yesterday rather than 1d ago', () => {
    expect(formatRelativeTime(ago(86_400_000), now)).toBe('yesterday')
  })

  it('does not produce a negative duration for a future timestamp', () => {
    // Clock skew between the server and the browser is real; it must not render "-3m ago".
    expect(formatRelativeTime(new Date(now.getTime() + 60_000).toISOString(), now)).toBe(
      'just now',
    )
  })
})

describe('minutesBetween', () => {
  it('measures elapsed minutes', () => {
    const from = '2026-08-12T12:00:00.000Z'
    const to = '2026-08-12T12:17:00.000Z'
    expect(minutesBetween(from, to)).toBe(17)
  })

  it('clamps to zero rather than returning a negative wait', () => {
    expect(minutesBetween('2026-08-12T12:30:00.000Z', '2026-08-12T12:00:00.000Z')).toBe(0)
  })
})

describe('formatDuration', () => {
  it('renders minutes under an hour', () => {
    expect(formatDuration(45)).toBe('45m')
  })

  it('renders whole hours without a stray 0m', () => {
    expect(formatDuration(120)).toBe('2h')
  })

  it('renders hours and minutes', () => {
    expect(formatDuration(95)).toBe('1h 35m')
  })
})

describe('pluralize', () => {
  it('uses the singular for exactly one', () => {
    expect(pluralize(1, 'item')).toBe('1 item')
  })

  it('uses the plural otherwise', () => {
    expect(pluralize(0, 'item')).toBe('0 items')
    expect(pluralize(3, 'item')).toBe('3 items')
  })

  it('accepts an irregular plural', () => {
    expect(pluralize(2, 'person', 'people')).toBe('2 people')
  })
})

describe('initials', () => {
  it('takes the first letter of the first two words', () => {
    expect(initials('Amara Okafor')).toBe('AO')
  })

  it('handles a single name', () => {
    expect(initials('Cher')).toBe('C')
  })

  it('ignores extra whitespace', () => {
    expect(initials('  Tomás   Lindqvist ')).toBe('TL')
  })
})

describe('truncate', () => {
  it('leaves short strings alone', () => {
    expect(truncate('short', 10)).toBe('short')
  })

  it('adds an ellipsis when cutting', () => {
    expect(truncate('a much longer string', 10)).toBe('a much lo…')
  })
})

describe('percentChange', () => {
  it('computes a percentage delta', () => {
    expect(percentChange(150, 100)).toBe(50)
    expect(percentChange(50, 100)).toBe(-50)
  })

  it('returns null when there is no baseline, rather than Infinity', () => {
    expect(percentChange(100, 0)).toBeNull()
  })
})
