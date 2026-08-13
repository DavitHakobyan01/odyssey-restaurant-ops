/**
 * Dashboard statistics data access.
 *
 * Every figure the dashboard renders is aggregated by Postgres. Nothing here selects
 * order rows for the service to reduce in JavaScript: a KPI derived from a *page* of
 * results is silently wrong, and one derived from *every* result would mean streaming the
 * whole orders table into a Worker isolate on each dashboard load. `count`, `sum` and
 * `generate_series` do the work where the data already is.
 *
 * Two details of this file are easy to get wrong, so each is handled once, deliberately:
 *
 * 1. **bigint arrives as a string.** `count()` and `sum(int4)` return `bigint`, and
 *    postgres-js maps `bigint` (OID 20) to a JavaScript *string* because int8 does not
 *    fit in a double. Every field in `dashboardOverviewSchema` is `z.number().int()`, so
 *    an unconverted aggregate serialises as `"1234"` and fails contract validation — or,
 *    worse, gets `+`-concatenated somewhere upstream. Aggregates are therefore typed
 *    `sql<string>` (which is the truth about the driver) and passed through `toCount()`,
 *    the single conversion point in this module.
 *
 * 2. **Time windows belong to the database.** Range boundaries are `now()`/`interval`
 *    fragments, never JS `Date`s. The clock and the time zone that decide what "today"
 *    means are the database's, so a Worker isolate's clock is irrelevant and two queries
 *    issued milliseconds apart cannot disagree about where the window starts.
 */
import { and, asc, desc, eq, gte, inArray, ne, sql, type SQL } from 'drizzle-orm'

import type { OrderStatus, StatsRange } from '@odyssey/types'
import { orderItems, orders } from '@odyssey/types/db'

import type { Database } from '../db/client'

/* -------------------------------------------------------------------------- */
/*                            Aggregate conversion                             */
/* -------------------------------------------------------------------------- */

/**
 * Turn a Postgres aggregate into the integer the contract declares.
 *
 * `null` maps to 0 so callers do not have to distinguish "no rows matched" from "the sum
 * was zero" — for a KPI they are the same statement. A value that is not finite is a
 * genuine bug (a mistyped column, a driver change), so it throws rather than quietly
 * reporting 0 revenue, which an operator would read as a real business fact.
 */
function toCount(value: string | number | null): number {
  if (value === null) return 0

  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) {
    throw new Error(`Expected a numeric aggregate from Postgres but received '${String(value)}'`)
  }

  // Aggregates over integer cent columns are always whole. `trunc` is belt-and-braces
  // against a future averaging expression leaking a fraction into an int-typed field.
  return Math.trunc(parsed)
}

/* -------------------------------------------------------------------------- */
/*                               Range windows                                 */
/* -------------------------------------------------------------------------- */

/**
 * Lower bound of the selected window, or `undefined` for `all` (which has none).
 *
 * The windows are aligned to whole days rather than being a rolling `now() - 7 days`.
 * That is deliberate: the trend chart buckets by day, so a rolling bound would make the
 * first bucket a partial day that renders as a misleading dip, and the trend would no
 * longer sum to the headline `revenueCents`. `7d` therefore means "today plus the six
 * days before it" — seven whole buckets that reconcile exactly with the headline figure.
 *
 * A fresh `SQL` fragment is built per call rather than shared from a module-level map,
 * so no two concurrently-executing queries can ever hold a reference to the same object.
 */
function rangeStart(range: StatsRange): SQL | undefined {
  switch (range) {
    case 'today':
      return sql`date_trunc('day', now())`
    case '7d':
      return sql`date_trunc('day', now()) - interval '6 days'`
    case '30d':
      return sql`date_trunc('day', now()) - interval '29 days'`
    case 'all':
      return undefined
  }
}

/**
 * `placed_at` falls inside the window. `undefined` for `all`, which Drizzle's `and()`
 * drops — the absence of a filter is how "no lower bound" is expressed, rather than a
 * sentinel date that would quietly exclude backdated rows.
 */
function placedInRange(range: StatsRange): SQL | undefined {
  const start = rangeStart(range)
  return start ? gte(orders.placedAt, start) : undefined
}

/**
 * Revenue-bearing orders: everything except cancellations.
 *
 * A cancelled order was never paid for, so counting it would inflate both revenue and
 * the average order value. It is still visible in the per-status breakdown — see
 * `countOrdersByStatus`, which deliberately does *not* apply this predicate.
 */
function isNotCancelled(): SQL {
  return ne(orders.status, 'cancelled')
}

/* -------------------------------------------------------------------------- */
/*                                  Headline                                   */
/* -------------------------------------------------------------------------- */

/**
 * Order count and gross revenue for the window, cancellations excluded.
 *
 * `count(*)` and `sum(...)` travel together in one query because they scan the same rows
 * under the same predicate; splitting them would double the work and open a window in
 * which the two figures could be computed against different data.
 *
 * `coalesce(sum(...), 0)` matters: `sum()` over zero rows is `NULL`, not `0`.
 */
export async function getRangeTotals(
  db: Database,
  range: StatsRange,
): Promise<{ totalOrders: number; revenueCents: number }> {
  const [row] = await db
    .select({
      totalOrders: sql<string>`count(*)`,
      revenueCents: sql<string>`coalesce(sum(${orders.totalCents}), 0)`,
    })
    .from(orders)
    .where(and(isNotCancelled(), placedInRange(range)))

  // An aggregate with no GROUP BY always yields exactly one row, but
  // `noUncheckedIndexedAccess` is right to insist we say what happens if it does not.
  return {
    totalOrders: toCount(row?.totalOrders ?? 0),
    revenueCents: toCount(row?.revenueCents ?? 0),
  }
}

/**
 * Live queue depth — deliberately *not* scoped to the selected range.
 *
 * An order placed last Tuesday that nobody has accepted is still sitting in the queue
 * today, and an operator looking at "3 pending" needs that to mean "3 orders need a
 * decision right now", not "3 orders were placed today and are still pending". Scoping
 * these to the range would hide exactly the stale work the number exists to surface.
 *
 * Both counts come from one table scan via `FILTER`, and the statuses are supplied by
 * the caller: which statuses constitute "in the kitchen" is a business rule and belongs
 * in the service, while counting them is this layer's job.
 */
export async function countLiveOrders(
  db: Database,
  statuses: { pending: OrderStatus; inProgress: readonly OrderStatus[] },
): Promise<{ pendingOrders: number; inProgressOrders: number }> {
  const isPending = eq(orders.status, statuses.pending)
  const isInProgress = inArray(orders.status, [...statuses.inProgress])

  const [row] = await db
    .select({
      pendingOrders: sql<string>`count(*) filter (where ${isPending})`,
      inProgressOrders: sql<string>`count(*) filter (where ${isInProgress})`,
    })
    .from(orders)

  return {
    pendingOrders: toCount(row?.pendingOrders ?? 0),
    inProgressOrders: toCount(row?.inProgressOrders ?? 0),
  }
}

/**
 * Order counts per status within the window.
 *
 * Cancellations are included here on purpose: a spike in cancellations is an operational
 * signal, and hiding it because it does not contribute revenue would be the wrong call.
 *
 * Only statuses that actually occur come back — SQL cannot invent rows for statuses with
 * no orders. Filling the gaps is the service's job, because the fixed set of chips the
 * UI renders is a presentation rule, and `ORDER_STATUSES` is its source of truth.
 */
export async function countOrdersByStatus(
  db: Database,
  range: StatsRange,
): Promise<{ status: OrderStatus; count: number }[]> {
  const rows = await db
    .select({
      status: orders.status,
      orderCount: sql<string>`count(*)`,
    })
    .from(orders)
    .where(placedInRange(range))
    .groupBy(orders.status)

  return rows.map((row) => ({ status: row.status, count: toCount(row.orderCount) }))
}

/* -------------------------------------------------------------------------- */
/*                                Popular items                                */
/* -------------------------------------------------------------------------- */

/**
 * Best sellers by units sold, from the order lines rather than the menu.
 *
 * Three decisions worth stating:
 *
 * - The join to `orders` exists solely to apply the range and cancellation predicates.
 *   `order_items` carries no timestamp of its own that means "when this was sold" —
 *   `placed_at` on the parent order is the authority — and units on a cancelled order
 *   were never actually sold.
 *
 * - The name comes from `name_snapshot`, never from `menu_items.name`. The snapshot is
 *   what the customer was shown; joining to the live menu would retroactively rewrite
 *   history the moment an item is renamed, and would break entirely for an item that has
 *   since been removed.
 *
 * - Grouping is by `menu_item_id` alone. Grouping by `(id, name_snapshot)` would split a
 *   renamed item into two competing rows that each under-report its true volume, so the
 *   name is resolved with `array_agg(... order by created_at desc)[1]` — the most recent
 *   snapshot, i.e. what the item is called today, while every unit still rolls up to one
 *   row. Still one aggregate, still one pass.
 *
 * Ties are broken by revenue and then by id so the list is stable between refreshes;
 * a "top 5" that reshuffles on every poll reads as data churn to an operator.
 */
export async function findTopSellingItems(
  db: Database,
  range: StatsRange,
  limit: number,
): Promise<{ menuItemId: string; name: string; quantitySold: number; revenueCents: number }[]> {
  const quantitySold = sql<string>`sum(${orderItems.quantity})`
  const revenueCents = sql<string>`sum(${orderItems.lineTotalCents})`
  const latestName = sql<string>`
    (array_agg(${orderItems.nameSnapshot} order by ${orderItems.createdAt} desc))[1]
  `

  const rows = await db
    .select({
      menuItemId: orderItems.menuItemId,
      name: latestName,
      quantitySold,
      revenueCents,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(and(isNotCancelled(), placedInRange(range)))
    .groupBy(orderItems.menuItemId)
    .orderBy(desc(quantitySold), desc(revenueCents), asc(orderItems.menuItemId))
    .limit(limit)

  return rows.map((row) => ({
    menuItemId: row.menuItemId,
    name: row.name,
    quantitySold: toCount(row.quantitySold),
    revenueCents: toCount(row.revenueCents),
  }))
}

/* -------------------------------------------------------------------------- */
/*                                Revenue trend                                */
/* -------------------------------------------------------------------------- */

/** Bucket width for the trend: hourly within a single day, daily over longer windows. */
function trendBucket(range: StatsRange): { unit: SQL; step: SQL } {
  return range === 'today'
    ? { unit: sql`'hour'`, step: sql`interval '1 hour'` }
    : { unit: sql`'day'`, step: sql`interval '1 day'` }
}

/**
 * Where the generated series begins.
 *
 * For a bounded range this is exactly the range's lower bound, so the buckets tile the
 * window with no gap and no overhang and their revenue sums to `revenueCents`.
 *
 * `all` has no lower bound, so the series starts at the first order ever placed. The
 * scalar subquery returns one row even against an empty table, where `coalesce` falls
 * back to `now()` and a brand-new restaurant gets a single empty bucket rather than an
 * error or an empty chart.
 */
function trendSeriesStart(range: StatsRange): SQL {
  const start = rangeStart(range)
  if (start) return start

  return sql`(
    select date_trunc('day', coalesce(min(${orders.placedAt}), now()))
    from ${orders}
    where ${isNotCancelled()}
  )`
}

type RevenueTrendRow = {
  bucket: Date
  revenueCents: string
  orderCount: string
}

/**
 * Revenue over time, with empty buckets materialised.
 *
 * This is the one query that cannot be expressed with the query builder, because its
 * correctness depends on `generate_series`. A plain `GROUP BY date_trunc(...)` only
 * returns buckets that *have* orders, and a line chart fed those points draws a straight
 * segment across the missing ones — a quiet Tuesday becomes an invisible interpolation
 * between Monday and Wednesday, and a flat overnight stretch looks like steady trade.
 * Generating the buckets first and LEFT JOINing the aggregate onto them guarantees every
 * interval in the window is present, with an honest zero where nothing was sold.
 *
 * Every interpolated fragment is either a Drizzle column/table reference or a literal
 * chosen from the closed `STATS_RANGES` enum, so nothing user-supplied reaches the SQL
 * text; the range itself has already been validated by `statsQuerySchema` at the edge.
 */
export async function getRevenueTrend(
  db: Database,
  range: StatsRange,
): Promise<{ bucket: Date; revenueCents: number; orderCount: number }[]> {
  const { unit, step } = trendBucket(range)
  const seriesStart = trendSeriesStart(range)

  const rows = await db.execute<RevenueTrendRow>(sql`
    with bounds as (
      select
        ${seriesStart} as series_start,
        date_trunc(${unit}, now()) as series_end
    ),
    buckets as (
      select generate_series(bounds.series_start, bounds.series_end, ${step}) as bucket
      from bounds
    ),
    totals as (
      select
        date_trunc(${unit}, ${orders.placedAt}) as bucket,
        sum(${orders.totalCents}) as revenue_cents,
        count(*) as order_count
      from ${orders}
      cross join bounds
      where ${isNotCancelled()}
        and ${orders.placedAt} >= bounds.series_start
      group by 1
    )
    select
      buckets.bucket as "bucket",
      coalesce(totals.revenue_cents, 0) as "revenueCents",
      coalesce(totals.order_count, 0) as "orderCount"
    from buckets
    left join totals on totals.bucket = buckets.bucket
    order by buckets.bucket asc
  `)

  return rows.map((row) => ({
    bucket: row.bucket,
    revenueCents: toCount(row.revenueCents),
    orderCount: toCount(row.orderCount),
  }))
}
