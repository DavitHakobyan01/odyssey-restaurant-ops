/**
 * Dashboard KPI business rules.
 *
 * The service decides *what the numbers mean*; the repository decides how to get them.
 * Concretely, this layer owns three rules that SQL cannot state for itself:
 *
 *   - which statuses count as "in the kitchen",
 *   - that the status breakdown is a fixed set of chips, not "whatever had rows",
 *   - how an average order value is derived, and what it is when there are no orders.
 *
 * Everything else is arithmetic Postgres has already done. Nothing in this file iterates
 * orders: the only loops are over the six-element `ORDER_STATUSES` tuple and over rows
 * that are themselves already aggregates.
 *
 * There is no `AppError` here, and that is not an oversight. Every range is valid, and an
 * empty restaurant is a legitimate answer (all zeroes), not a 404 — a dashboard that
 * errors on its first day would be worse than one that honestly reports nothing yet.
 */
import type { DashboardOverview, OrderStatus, StatsQuery } from '@odyssey/types'
import { ORDER_STATUSES } from '@odyssey/types'

import type { Database } from '../db/client'
import { toIso } from '../mappers'
import * as repo from '../repositories/stats.repository'

/**
 * "In the kitchen": accepted but not yet handed over.
 *
 * `pending` is excluded because it is surfaced separately — those orders are waiting on
 * an operator, not on a cook, and conflating the two hides which queue needs attention.
 * `satisfies` keeps this honest: adding a status to the lifecycle cannot silently produce
 * a typo here, and removing one breaks the build rather than the dashboard.
 */
const IN_PROGRESS_STATUSES = ['accepted', 'preparing', 'ready'] as const satisfies readonly OrderStatus[]

const PENDING_STATUS: OrderStatus = 'pending'

/** The dashboard's best-sellers card renders five rows; asking for more is wasted work. */
const POPULAR_ITEM_LIMIT = 5

/**
 * Build the whole dashboard payload for one range.
 *
 * The five queries are independent reads, so they are issued together rather than
 * sequentially — the page is a single request and its latency is the slowest query, not
 * the sum of all five. (postgres-js queues them on the request's single connection; the
 * win is pipelining, not parallel connections. See db/client.ts for why `max: 1`.)
 *
 * The explicit `Promise<DashboardOverview>` return type is load-bearing: it makes the
 * compiler check this object against the same contract the OpenAPI document was
 * generated from, so a repository that ever handed back a bigint-as-string would fail the
 * build here instead of failing zod validation in production.
 */
export async function getDashboardOverview(
  db: Database,
  query: StatsQuery,
): Promise<DashboardOverview> {
  const { range } = query

  const [totals, live, statusCounts, popularItems, trend] = await Promise.all([
    repo.getRangeTotals(db, range),
    repo.countLiveOrders(db, { pending: PENDING_STATUS, inProgress: IN_PROGRESS_STATUSES }),
    repo.countOrdersByStatus(db, range),
    repo.findTopSellingItems(db, range, POPULAR_ITEM_LIMIT),
    repo.getRevenueTrend(db, range),
  ])

  return {
    range,
    totalOrders: totals.totalOrders,
    revenueCents: totals.revenueCents,
    pendingOrders: live.pendingOrders,
    inProgressOrders: live.inProgressOrders,
    averageOrderValueCents: averageOrderValue(totals.revenueCents, totals.totalOrders),
    ordersByStatus: fillMissingStatuses(statusCounts),
    popularItems,
    revenueTrend: trend.map((point) => ({
      // Drizzle hands back `Date` for timestamptz; the contract is an ISO-8601 string.
      // Converted through the shared mapper rather than trusting JSON.stringify.
      bucket: toIso(point.bucket),
      revenueCents: point.revenueCents,
      orderCount: point.orderCount,
    })),
  }
}

/**
 * Mean revenue per non-cancelled order, floored to whole cents.
 *
 * Zero orders yields zero rather than `NaN`. That guard is the entire reason this is a
 * named function: `revenue / orders` is correct on every day the restaurant traded and
 * catastrophic on the one day it did not, and `NaN` does not survive `z.number().int()`
 * — the whole dashboard would 500 on a quiet morning.
 *
 * Flooring keeps the value an integer number of cents, as the contract requires. It is
 * a display figure derived from two integers Postgres has already summed, not money being
 * re-computed in JavaScript: no per-order arithmetic happens here, so there is nothing
 * for float drift to accumulate over. This mirrors `toCustomerWithStats` in the mappers,
 * which computes the equivalent per-customer figure the same way.
 */
function averageOrderValue(revenueCents: number, totalOrders: number): number {
  if (totalOrders <= 0) return 0
  return Math.floor(revenueCents / totalOrders)
}

/**
 * Project the statuses that had orders onto the full lifecycle.
 *
 * The UI renders one chip per status, always, in lifecycle order. Returning only the
 * statuses that happened to have rows would make the chip row's shape depend on the
 * data, so chips would appear and disappear between refreshes and an operator could not
 * tell "zero cancellations today" from "cancellations not shown". Iterating
 * `ORDER_STATUSES` — the same tuple the Postgres enum is built from — guarantees both
 * completeness and a stable order, and means a new status added to the lifecycle shows
 * up on the dashboard without a change here.
 */
function fillMissingStatuses(
  counts: { status: OrderStatus; count: number }[],
): { status: OrderStatus; count: number }[] {
  const byStatus = new Map(counts.map((row) => [row.status, row.count]))
  return ORDER_STATUSES.map((status) => ({ status, count: byStatus.get(status) ?? 0 }))
}
