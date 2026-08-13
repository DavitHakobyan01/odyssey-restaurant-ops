/**
 * Pricing tests.
 *
 * This function is the only implementation of order pricing in the codebase — the API
 * uses it to compute the totals it persists, the dashboard uses it for the live cart
 * estimate, and the seed script uses it so demo data obeys the same rules. A bug here is
 * a bug in all three at once, which is why it is tested directly rather than only through
 * the API.
 */
import { describe, expect, it } from 'vitest'

import { applyBasisPoints, calculateLineTotal, calculateOrderTotals } from './pricing'

describe('applyBasisPoints', () => {
  it('applies a rate in basis points', () => {
    // 875 bps = 8.75% of $100.00 = $8.75
    expect(applyBasisPoints(10_000, 875)).toBe(875)
  })

  it('returns zero for a zero rate', () => {
    expect(applyBasisPoints(12_345, 0)).toBe(0)
  })

  it('always returns an integer', () => {
    // 8.75% of 3333 is 291.6375 — must not leak a fraction of a cent.
    const result = applyBasisPoints(3333, 875)
    expect(Number.isInteger(result)).toBe(true)
    expect(result).toBe(292)
  })

  it('rounds half away from zero rather than toward positive infinity', () => {
    // 50 bps of 101 = 0.505 -> 1
    expect(applyBasisPoints(101, 50)).toBe(1)
    // The negative case matters if a refund is ever modelled: -0.505 must go to -1,
    // not to 0 as Math.round alone would give.
    expect(applyBasisPoints(-101, 50)).toBe(-1)
  })

  it('handles a 100% rate', () => {
    expect(applyBasisPoints(5000, 10_000)).toBe(5000)
  })
})

describe('calculateLineTotal', () => {
  it('multiplies unit price by quantity', () => {
    expect(calculateLineTotal({ unitPriceCents: 1650, quantity: 3 })).toBe(4950)
  })

  it('handles quantity of one', () => {
    expect(calculateLineTotal({ unitPriceCents: 999, quantity: 1 })).toBe(999)
  })
})

describe('calculateOrderTotals', () => {
  const rates = { taxRateBps: 875, serviceFeeBps: 500 }

  it('sums lines into a subtotal', () => {
    const totals = calculateOrderTotals(
      [
        { unitPriceCents: 1600, quantity: 2 },
        { unitPriceCents: 650, quantity: 1 },
      ],
      rates,
    )

    expect(totals.subtotalCents).toBe(3850)
  })

  it('maintains the invariant total = subtotal + tax + fee', () => {
    const totals = calculateOrderTotals([{ unitPriceCents: 1234, quantity: 7 }], rates)

    expect(totals.totalCents).toBe(
      totals.subtotalCents + totals.taxCents + totals.serviceFeeCents,
    )
  })

  it('applies tax and service fee to the subtotal, not compounded on each other', () => {
    const totals = calculateOrderTotals([{ unitPriceCents: 10_000, quantity: 1 }], rates)

    expect(totals.subtotalCents).toBe(10_000)
    expect(totals.taxCents).toBe(875) // 8.75% of subtotal
    expect(totals.serviceFeeCents).toBe(500) // 5% of subtotal, NOT of subtotal + tax
    expect(totals.totalCents).toBe(11_375)
  })

  it('returns all zeros for an empty order', () => {
    const totals = calculateOrderTotals([], rates)

    expect(totals).toEqual({
      subtotalCents: 0,
      taxCents: 0,
      serviceFeeCents: 0,
      totalCents: 0,
    })
  })

  it('produces no tax or fee when both rates are zero', () => {
    const totals = calculateOrderTotals([{ unitPriceCents: 2500, quantity: 2 }], {
      taxRateBps: 0,
      serviceFeeBps: 0,
    })

    expect(totals.totalCents).toBe(5000)
    expect(totals.taxCents).toBe(0)
    expect(totals.serviceFeeCents).toBe(0)
  })

  it('keeps every field an integer for awkward amounts', () => {
    // Deliberately chosen to produce repeating decimals under naive float maths.
    const totals = calculateOrderTotals(
      [
        { unitPriceCents: 333, quantity: 3 },
        { unitPriceCents: 777, quantity: 7 },
      ],
      { taxRateBps: 733, serviceFeeBps: 291 },
    )

    for (const value of Object.values(totals)) {
      expect(Number.isInteger(value)).toBe(true)
    }
    expect(totals.totalCents).toBe(
      totals.subtotalCents + totals.taxCents + totals.serviceFeeCents,
    )
  })

  it('rounds once per component rather than per line', () => {
    // Three lines that would each round up individually. Rounding per line would give a
    // different (larger) tax than rounding the summed subtotal once.
    const lines = [
      { unitPriceCents: 101, quantity: 1 },
      { unitPriceCents: 101, quantity: 1 },
      { unitPriceCents: 101, quantity: 1 },
    ]
    const totals = calculateOrderTotals(lines, { taxRateBps: 50, serviceFeeBps: 0 })

    // 50 bps of 303 = 1.515 -> 2.  Per-line would have been 1+1+1 = 3.
    expect(totals.subtotalCents).toBe(303)
    expect(totals.taxCents).toBe(2)
  })

  it('is deterministic — the same input always yields the same output', () => {
    const input = [{ unitPriceCents: 1875, quantity: 4 }]
    const first = calculateOrderTotals(input, rates)
    const second = calculateOrderTotals(input, rates)
    expect(first).toEqual(second)
  })
})
