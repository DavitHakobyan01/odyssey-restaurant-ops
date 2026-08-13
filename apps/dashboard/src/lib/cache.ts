/**
 * Cache invalidation for writes that ripple beyond the resource they touch.
 *
 * Creating an order or moving one through its lifecycle does not only change that order.
 * The server derives several other things from the same rows:
 *
 *   GET /stats/overview     revenue, order counts, average order value, popular items,
 *                           and the live pending / in-progress queue depths
 *   GET /customers          lifetime spend, order count, last-order date
 *   GET /customers/{id}     the same aggregates for one customer
 *
 * Cancelled orders are excluded from every one of those figures server-side, so a
 * cancellation moves money out of the CRM and out of the KPIs. Invalidating only the
 * order caches left those screens showing revenue the restaurant never took.
 *
 * This is centralised because the omission originally appeared independently in three
 * places — the transition hook, the create-order modal, and the menu screen. One list of
 * dependents means the next write that affects them has somewhere obvious to register.
 */
import type { QueryClient } from '@tanstack/react-query'

import {
  getGetCustomerQueryKey,
  getGetDashboardOverviewQueryKey,
  getListCustomersQueryKey,
  getListFullMenuQueryKey,
  getListMenuItemsQueryKey,
  getListOrdersQueryKey,
} from '@odyssey/api-client'

/**
 * Everything a created or transitioned order invalidates.
 *
 * The key factories called with no arguments return the bare path (`['/orders']`), which
 * is a prefix of every parameterised variant (`['/orders', { status: [...] }]`). React
 * Query matches prefixes, so this covers every filter, page and sort combination without
 * enumerating them.
 *
 * `getGetCustomerQueryKey(id)` is deliberately separate: it is `['/customers/{id}']`, a
 * different first element, so the list invalidation does not reach it.
 */
export async function invalidateOrderDependents(
  queryClient: QueryClient,
  customerId?: string,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() }),
    queryClient.invalidateQueries({ queryKey: getGetDashboardOverviewQueryKey() }),
    queryClient.invalidateQueries({ queryKey: getListCustomersQueryKey() }),
    ...(customerId
      ? [queryClient.invalidateQueries({ queryKey: getGetCustomerQueryKey(customerId) })]
      : []),
  ])
}

/**
 * Everything a menu write invalidates.
 *
 * `/menu/full` powers the Menu screen, but `/menu/items` is a *separate* cache entry that
 * the create-order modal reads to list orderable items. Marking an item unavailable
 * without invalidating both left the order form still offering a sold-out dish — which
 * the server then correctly rejected with ITEM_UNAVAILABLE, so the operator saw a
 * confusing error for an item the Menu screen had already greyed out.
 *
 * The dashboard overview is included because `popularItems` carries item names.
 */
export async function invalidateMenuDependents(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: getListFullMenuQueryKey() }),
    queryClient.invalidateQueries({ queryKey: getListMenuItemsQueryKey() }),
    queryClient.invalidateQueries({ queryKey: getGetDashboardOverviewQueryKey() }),
  ])
}
