/**
 * Order pricing — pure integer arithmetic, no dependencies.
 *
 * This module is the *only* implementation of order pricing in the codebase. The
 * backend calls it to compute the authoritative totals it persists, and the dashboard
 * calls the same function to show a live estimate while an operator builds a cart.
 *
 * Sharing the function is what makes the estimate trustworthy; the server remaining the
 * one that writes to the database is what makes it safe. If a client ever disagrees with
 * the server (a stale menu price, a tampered payload), the order is rejected with
 * TOTAL_MISMATCH rather than quietly charging a different amount.
 *
 * All money is in minor units (cents) and every intermediate value stays an integer.
 * Floating point never touches a currency amount.
 */

export type PricedLine = {
  unitPriceCents: number
  quantity: number
}

export type PricingRates = {
  /** Basis points, 1/100th of a percent. 875 = 8.75%. */
  taxRateBps: number
  /** Basis points. 0 disables the service fee. */
  serviceFeeBps: number
}

export type OrderTotals = {
  subtotalCents: number
  taxCents: number
  serviceFeeCents: number
  totalCents: number
}

/** Basis points denominator: 10_000 bps = 100%. */
export const BPS_DENOMINATOR = 10_000

/**
 * Apply a basis-point rate to an integer amount, rounding half away from zero.
 *
 * `Math.round` alone rounds half *up*, which biases negative values — amounts here are
 * always non-negative, but rounding explicitly keeps the intent obvious and makes the
 * function safe if that ever changes.
 */
export function applyBasisPoints(amountCents: number, bps: number): number {
  const raw = (amountCents * bps) / BPS_DENOMINATOR
  return Math.sign(raw) * Math.round(Math.abs(raw))
}

export function calculateLineTotal(line: PricedLine): number {
  return line.unitPriceCents * line.quantity
}

/**
 * Compute every monetary field on an order.
 *
 * Tax and service fee are both applied to the subtotal, not compounded on each other —
 * a service fee is not taxable here. Rounding happens once per component rather than
 * per line, so the persisted total always equals subtotal + tax + fee exactly.
 */
export function calculateOrderTotals(lines: PricedLine[], rates: PricingRates): OrderTotals {
  const subtotalCents = lines.reduce((sum, line) => sum + calculateLineTotal(line), 0)
  const taxCents = applyBasisPoints(subtotalCents, rates.taxRateBps)
  const serviceFeeCents = applyBasisPoints(subtotalCents, rates.serviceFeeBps)

  return {
    subtotalCents,
    taxCents,
    serviceFeeCents,
    totalCents: subtotalCents + taxCents + serviceFeeCents,
  }
}
