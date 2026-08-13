/**
 * The Home screen's data layer.
 *
 * Every figure on the overview comes from a single `GET /stats/overview` request. That is
 * deliberate: six separate KPI requests would each open their own Worker-scoped database
 * connection and could observe the database at six different instants, so the tiles and
 * the chart would not reconcile with each other. One request, one snapshot.
 *
 * The screen performs no arithmetic of its own. Revenue is summed in SQL, averages are
 * computed server-side, and cancelled orders are already excluded — summing a *page* of
 * results in the client would produce a confidently wrong number. What lives here is
 * therefore shaping, not calculation: ordering the status chips and deciding whether the
 * response describes an empty database.
 */
import { useMemo } from 'react'

import { useGetDashboardOverview } from '@odyssey/api-client'
import type { GetDashboardOverviewRange } from '@odyssey/api-client'
import { ORDER_STATUSES } from '@odyssey/types/domain'
import type { OrderStatus } from '@odyssey/types/domain'

export type DashboardStatusCount = {
  status: OrderStatus
  count: number
}

export function useDashboardOverview(range: GetDashboardOverviewRange) {
  const query = useGetDashboardOverview({ range })
  const { data } = query

  /**
   * The API guarantees every status is present, including zeros. Re-deriving the list
   * from ORDER_STATUSES rather than from the response keeps the chip order stable across
   * ranges — sorting by count would make chips jump around as data changes.
   */
  const statusCounts = useMemo<DashboardStatusCount[]>(() => {
    const byStatus = new Map(data?.ordersByStatus.map((entry) => [entry.status, entry.count]))
    return ORDER_STATUSES.map((status) => ({ status, count: byStatus.get(status) ?? 0 }))
  }, [data])

  /**
   * A freshly migrated database returns a valid response of all zeros. Rendering a wall
   * of "$0.00" would look like a broken dashboard, so the empty state names the actual
   * next step instead.
   */
  /**
   * "No orders yet" must mean the database is empty, not that this range is quiet.
   *
   * pendingOrders and inProgressOrders are live queue depths and are NOT scoped to the
   * selected range, so including them is what distinguishes a brand-new restaurant from
   * an established one looking at a slow Tuesday. Without inProgressOrders the screen
   * could claim there were no orders while a dozen sat in the kitchen.
   */
  const isEmpty =
    data !== undefined &&
    data.totalOrders === 0 &&
    data.pendingOrders === 0 &&
    data.inProgressOrders === 0 &&
    data.revenueCents === 0

  /**
   * The query result is spread rather than re-packed field by field so its discriminated
   * union survives: the route's `if (isPending) return` is what narrows `data` to
   * non-optional, and rebuilding the object by hand would collapse that union and force a
   * non-null assertion at every `data.` in the JSX.
   */
  return { ...query, statusCounts, isEmpty }
}
