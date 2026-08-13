/**
 * Customer data access, including the CRM aggregate query.
 *
 * Repositories own SQL and nothing else — no business rules, no HTTP, no DTO shaping.
 * They return Drizzle rows; the service decides what those rows mean.
 *
 * The interesting part of this module is `listWithStats` / `findByIdWithStats`. Lifetime
 * order count, lifetime spend and last-order date are computed by the database in a
 * single grouped query. The naive alternative — select the customers, then select their
 * orders, then reduce in JavaScript — is an N+1 that also transfers every order row over
 * the wire just to throw it away after summing. On a per-request Postgres connection
 * (see db/client.ts) that cost is paid on every page load of the CRM table.
 */
import { and, asc, count, desc, eq, ilike, ne, or, sql, type SQL } from 'drizzle-orm'

import type { CustomerListQuery } from '@odyssey/types'
import { customers, orders } from '@odyssey/types/db'
import type { CustomerRow, NewCustomerRow } from '@odyssey/types/db'

import type { Database } from '../db/client'

/**
 * A customer row widened with the aggregates the CRM list needs.
 *
 * Declared structurally here rather than imported from the mapper layer so the
 * repository stays free of any dependency on DTO shaping. It is deliberately
 * assignment-compatible with the mapper's `CustomerStatsRow`.
 */
export type CustomerWithStatsRow = CustomerRow & {
  orderCount: number
  totalSpentCents: number
  lastOrderAt: Date | null
}

/* -------------------------------------------------------------------------- */
/*                            Aggregate expressions                            */
/* -------------------------------------------------------------------------- */

/*
 * These three expressions are declared once and reused in both the SELECT list and the
 * ORDER BY clause. Sorting the CRM table by "total spent" must sort by the *same*
 * arithmetic the row displays, so sharing the expression object is what stops the two
 * from drifting apart. Postgres permits an aggregate expression in ORDER BY of a
 * grouped query, so no subquery or lateral join is needed.
 */

/**
 * `count(orders.id)` counts non-NULL values only, so the LEFT JOIN's all-NULL row for a
 * customer with no orders naturally yields 0 rather than 1.
 *
 * The `::int` cast is load-bearing: Postgres types `count()` as `bigint`, and the
 * postgres-js driver hands bigints back as **strings** to avoid precision loss. Without
 * the cast this field would arrive as `"3"`, silently fail the `z.number().int()`
 * contract, and surface as a 500 from the response validator rather than as a type
 * error. Casting in SQL is also cheaper than coercing in JS for every row.
 */
const orderCountExpr = sql<number>`count(${orders.id})::int`

/**
 * Lifetime spend. `sum()` over an int4 column returns `bigint` (again a string over the
 * wire), and returns NULL — not 0 — when there are no rows to sum, hence COALESCE.
 *
 * `::int` bounds lifetime spend at ~$21.4M per customer, which is far beyond any
 * plausible restaurant total; the alternative (`::bigint`) would reintroduce the
 * string-over-the-wire problem this cast exists to solve.
 */
const totalSpentExpr = sql<number>`coalesce(sum(${orders.totalCents}), 0)::int`

/**
 * Most recent order date, or NULL for a customer who has never ordered. It is returned
 * as a `Date` — converting to ISO-8601 is the mapper's job, not the database's.
 *
 * `.mapWith(orders.placedAt)` is required, not decorative. Drizzle's postgres-js driver
 * deliberately replaces the driver's timestamp parsers with an identity function so that
 * it can own date conversion itself (see `postgres-js/driver.ts`). A bare `sql` fragment
 * gets the no-op decoder, so `max(placed_at)` would arrive as a raw *string* and the
 * mapper's `.toISOString()` would throw — a 500 on every CRM page load. Borrowing the
 * column's own decoder applies exactly the conversion a plain `select` would.
 *
 * NULL is preserved: Drizzle short-circuits null before calling the decoder, so a
 * customer who has never ordered still yields `null` rather than the epoch.
 */
const lastOrderAtExpr = sql<Date | null>`max(${orders.placedAt})`.mapWith(orders.placedAt)

/**
 * The join condition for every stats query.
 *
 * The `status <> 'cancelled'` predicate lives in the JOIN's ON clause, **not** in WHERE.
 * That distinction is the whole correctness of this query: in a WHERE clause the
 * predicate would be evaluated after the outer join produced its NULL row, filtering out
 * customers whose only orders were cancelled — and every customer with no orders at all.
 * In the ON clause it merely excludes cancelled orders from the match, leaving those
 * customers present with zero-valued aggregates.
 *
 * A cancelled order is not revenue and never happened as far as the CRM is concerned, so
 * it must not inflate order count, lifetime spend, or "last ordered".
 */
const nonCancelledOrdersJoin = and(
  eq(orders.customerId, customers.id),
  ne(orders.status, 'cancelled'),
)

/** The customer columns, listed explicitly because the aggregates share the SELECT. */
const customerColumns = {
  id: customers.id,
  name: customers.name,
  email: customers.email,
  phone: customers.phone,
  notes: customers.notes,
  createdAt: customers.createdAt,
  updatedAt: customers.updatedAt,
} as const

const statsColumns = {
  orderCount: orderCountExpr,
  totalSpentCents: totalSpentExpr,
  lastOrderAt: lastOrderAtExpr,
} as const

/* -------------------------------------------------------------------------- */
/*                                  Filtering                                  */
/* -------------------------------------------------------------------------- */

/**
 * Free-text search across name and email.
 *
 * `ilike` gives case-insensitive matching without wrapping the column in `lower()`,
 * which would make the expression unindexable. Both predicates apply to `customers`
 * only, so this filter is equally valid in the page query and the count query.
 */
function buildCustomerFilters(query: CustomerListQuery): SQL | undefined {
  if (!query.search) return undefined
  const pattern = `%${query.search}%`
  return or(ilike(customers.name, pattern), ilike(customers.email, pattern))
}

/**
 * Translate the validated `sortBy`/`sortDir` pair into an ORDER BY list.
 *
 * Two things worth stating:
 *
 *  1. Sorting by an aggregate (`totalSpent`, `orderCount`, `lastOrderAt`) orders by the
 *     aggregate *expression*, so the database does the ranking. Sorting a page in JS
 *     would only ever sort the 25 rows that happened to be fetched, which is a wrong
 *     answer rather than a slow one.
 *  2. `nulls last` is forced on `lastOrderAt`. Postgres defaults to NULLS FIRST for
 *     DESC, which would put every customer who has *never* ordered at the top of a
 *     "most recent first" list — the opposite of what the CRM is asking for.
 *
 * `customers.id` is appended as a tiebreaker in every case. Without a total order,
 * Postgres may return ties in a different sequence per query, which makes LIMIT/OFFSET
 * pagination drop or duplicate rows between pages.
 */
function buildOrderBy(query: CustomerListQuery): SQL[] {
  const direction = query.sortDir === 'asc' ? asc : desc

  switch (query.sortBy) {
    case 'name':
      return [direction(customers.name), asc(customers.id)]
    case 'totalSpent':
      return [direction(totalSpentExpr), asc(customers.id)]
    case 'orderCount':
      return [direction(orderCountExpr), asc(customers.id)]
    case 'lastOrderAt':
      return [sql`${direction(lastOrderAtExpr)} nulls last`, asc(customers.id)]
  }
}

/* -------------------------------------------------------------------------- */
/*                                    Reads                                    */
/* -------------------------------------------------------------------------- */

/**
 * One page of customers with their lifetime aggregates.
 *
 * `groupBy(customers.id)` is sufficient rather than listing every selected customer
 * column: `id` is the primary key, so Postgres recognises the remaining columns as
 * functionally dependent on it and permits them in the SELECT list.
 *
 * The count query is a plain `count(*)` over `customers` with the same filter — no join
 * is needed because the search predicate touches only customer columns, and counting
 * grouped rows would otherwise require an extra subquery for the same answer. It runs
 * concurrently with the page query since the two reads are independent.
 */
export async function listWithStats(
  db: Database,
  query: CustomerListQuery,
): Promise<{ rows: CustomerWithStatsRow[]; total: number }> {
  const where = buildCustomerFilters(query)

  const [rows, totalResult] = await Promise.all([
    db
      .select({ ...customerColumns, ...statsColumns })
      .from(customers)
      .leftJoin(orders, nonCancelledOrdersJoin)
      .where(where)
      .groupBy(customers.id)
      .orderBy(...buildOrderBy(query))
      .limit(query.limit)
      .offset(query.offset),
    db.select({ value: count() }).from(customers).where(where),
  ])

  return { rows, total: totalResult[0]?.value ?? 0 }
}

/**
 * A single customer with the same aggregates the list computes.
 *
 * Shares the expression definitions above so the detail view and the table row can never
 * disagree about a customer's lifetime spend.
 */
export async function findByIdWithStats(
  db: Database,
  id: string,
): Promise<CustomerWithStatsRow | undefined> {
  const [row] = await db
    .select({ ...customerColumns, ...statsColumns })
    .from(customers)
    .leftJoin(orders, nonCancelledOrdersJoin)
    .where(eq(customers.id, id))
    .groupBy(customers.id)
    .limit(1)

  return row
}

export async function findById(db: Database, id: string): Promise<CustomerRow | undefined> {
  const [row] = await db.select().from(customers).where(eq(customers.id, id)).limit(1)
  return row
}

/**
 * Case-insensitive lookup by email, used to enforce uniqueness before writing.
 *
 * The predicate is written as `lower(email) = <lowered literal>` so it matches the
 * expression the unique index is built on (`customers_email_key` on `lower(email)`),
 * making this an index scan rather than a sequential scan with a function call per row.
 */
export async function findByEmail(db: Database, email: string): Promise<CustomerRow | undefined> {
  const [row] = await db
    .select()
    .from(customers)
    .where(eq(sql`lower(${customers.email})`, email.toLowerCase()))
    .limit(1)
  return row
}

/* -------------------------------------------------------------------------- */
/*                                   Writes                                    */
/* -------------------------------------------------------------------------- */

export async function insert(db: Database, values: NewCustomerRow): Promise<CustomerRow> {
  const [row] = await db.insert(customers).values(values).returning()
  if (!row) throw new Error('Insert returned no row')
  return row
}

/**
 * Returns `undefined` when no row matched, which the service reads as "not found".
 * Reporting the miss instead of throwing keeps the 404 decision in the service layer.
 */
export async function updateById(
  db: Database,
  id: string,
  values: Partial<NewCustomerRow>,
): Promise<CustomerRow | undefined> {
  const [row] = await db
    .update(customers)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(customers.id, id))
    .returning()
  return row
}
