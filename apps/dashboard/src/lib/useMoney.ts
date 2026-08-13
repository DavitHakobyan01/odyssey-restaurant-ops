/**
 * Currency-aware money formatting.
 *
 * Every money figure in the dashboard was formatted with `formatMoney(cents)`, which
 * defaults to USD. The restaurant's actual currency is a server setting
 * (`RestaurantSettings.currency`), so a restaurant configured for EUR would have seen
 * dollar signs on every screen — correct amounts, wrong symbol.
 *
 * Reading settings here costs nothing: `useGetSettings` is a React Query hook, so the
 * response is shared across every component that calls it. The tenth caller does not
 * issue a tenth request.
 *
 * `'USD'` is the fallback while the query is in flight. That is a deliberate choice over
 * rendering a blank or a spinner in place of a price — a briefly-wrong symbol on a figure
 * that is otherwise correct is far less disruptive than money that pops into existence a
 * moment after the rest of the row.
 */
import { useMemo } from 'react'

import { useGetSettings } from '@odyssey/api-client'
import { formatMoney, formatMoneyCompact } from '@odyssey/shared'

export type MoneyFormatter = {
  /** Full precision — table cells, totals, line items. */
  format: (cents: number) => string
  /** Compact above $10,000 — KPI tiles. */
  compact: (cents: number) => string
  /** The resolved ISO currency code. */
  currency: string
}

export function useMoney(): MoneyFormatter {
  const { data } = useGetSettings()
  const currency = data?.currency ?? 'USD'

  return useMemo(
    () => ({
      format: (cents: number) => formatMoney(cents, { currency }),
      compact: (cents: number) => formatMoneyCompact(cents, { currency }),
      currency,
    }),
    [currency],
  )
}
