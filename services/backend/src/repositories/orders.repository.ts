/**
 * Order data access.
 *
 * SQL only — every business rule about what an order may do lives in orders.service.ts.
 * The one piece of "logic" here is transaction scoping, which is a persistence concern:
 * an order and its lines must become visible together or not at all.
 */
import { and, asc, count, desc, eq, gte, ilike, inArray, lte, or, sql } from 'drizzle-orm'

import type { CreateOrderLine, OrderListQuery, OrderStatus } from '@odyssey/types'
import { customers, orderItems, orders } from '@odyssey/types/db'
import type { NewOrderItemRow, OrderItemRow, OrderRow } from '@odyssey/types/db'

import type { Database } from '../db/client'
import { containsPattern } from '../lib/search'

/** The customer fields embedded in order responses. */
const customerRefColumns = {
  id: customers.id,
  name: customers.name,
  email: customers.email,
}

/* -------------------------------------------------------------------------- */
/*                                   Reads                                     */
/* -------------------------------------------------------------------------- */

function buildOrderFilters(query: OrderListQuery) {
  const filters = []

  if (query.status && query.status.length > 0) {
    filters.push(inArray(orders.status, query.status))
  }
  if (query.type) {
    filters.push(eq(orders.type, query.type))
  }
  if (query.customerId) {
    filters.push(eq(orders.customerId, query.customerId))
  }
  if (query.placedFrom) {
    filters.push(gte(orders.placedAt, new Date(query.placedFrom)))
  }
  if (query.placedTo) {
    filters.push(lte(orders.placedAt, new Date(query.placedTo)))
  }
  if (query.search) {
    // Escaped: an unescaped % or _ in the search term acts as a wildcard.
    const pattern = containsPattern(query.search)
    // Operators search by whatever they have to hand — the order number read off a
    // ticket, or the customer who is standing at the counter.
    filters.push(
      or(
        ilike(orders.orderNumber, pattern),
        ilike(customers.name, pattern),
        ilike(customers.email, pattern),
      ),
    )
  }

  return filters.length > 0 ? and(...filters) : undefined
}

function buildOrderSort(query: OrderListQuery) {
  const direction = query.sortDir === 'asc' ? asc : desc
  switch (query.sortBy) {
    case 'totalCents':
      return direction(orders.totalCents)
    case 'status':
      return direction(orders.status)
    case 'placedAt':
    default:
      return direction(orders.placedAt)
  }
}

export type OrderSummaryRow = OrderRow & {
  customer: { id: string; name: string; email: string }
  itemCount: number
}

export async function listOrders(
  db: Database,
  query: OrderListQuery,
): Promise<{ rows: OrderSummaryRow[]; total: number }> {
  const where = buildOrderFilters(query)

  /**
   * `itemCount` is a correlated subquery rather than a join + GROUP BY.
   *
   * Grouping would force every selected order column into the GROUP BY clause and make
   * the query fragile as columns are added. `.mapWith(Number)` is essential: Postgres
   * returns count() as bigint, which the driver hands back as a *string*, and the
   * contract declares an integer.
   */
  const itemCountExpr = sql<number>`(
    select count(*) from ${orderItems} where ${orderItems.orderId} = ${orders.id}
  )`.mapWith(Number)

  const [rows, totalResult] = await Promise.all([
    db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        customerId: orders.customerId,
        status: orders.status,
        type: orders.type,
        subtotalCents: orders.subtotalCents,
        taxCents: orders.taxCents,
        serviceFeeCents: orders.serviceFeeCents,
        totalCents: orders.totalCents,
        notes: orders.notes,
        placedAt: orders.placedAt,
        acceptedAt: orders.acceptedAt,
        preparingAt: orders.preparingAt,
        readyAt: orders.readyAt,
        completedAt: orders.completedAt,
        cancelledAt: orders.cancelledAt,
        cancellationReason: orders.cancellationReason,
        createdAt: orders.createdAt,
        updatedAt: orders.updatedAt,
        customer: customerRefColumns,
        itemCount: itemCountExpr,
      })
      .from(orders)
      // innerJoin, not leftJoin: customerId is NOT NULL with an FK, so every order has a
      // customer. A left join would imply otherwise and force needless null handling.
      .innerJoin(customers, eq(orders.customerId, customers.id))
      .where(where)
      .orderBy(buildOrderSort(query))
      .limit(query.limit)
      .offset(query.offset),
    db
      .select({ value: count() })
      .from(orders)
      .innerJoin(customers, eq(orders.customerId, customers.id))
      .where(where),
  ])

  return { rows, total: totalResult[0]?.value ?? 0 }
}

export type OrderDetailRow = OrderRow & {
  customer: { id: string; name: string; email: string }
  items: OrderItemRow[]
}

export async function findOrderDetailById(
  db: Database,
  id: string,
): Promise<OrderDetailRow | undefined> {
  // Relational query API: one round trip, correctly nested, no manual regrouping.
  const row = await db.query.orders.findFirst({
    where: eq(orders.id, id),
    with: {
      customer: { columns: { id: true, name: true, email: true } },
      items: { orderBy: [asc(orderItems.nameSnapshot)] },
    },
  })

  return row as OrderDetailRow | undefined
}

/** Minimal fetch used by the transition path — no joins needed to validate a state change. */
export async function findOrderById(db: Database, id: string): Promise<OrderRow | undefined> {
  const [row] = await db.select().from(orders).where(eq(orders.id, id)).limit(1)
  return row
}

/* -------------------------------------------------------------------------- */
/*                                   Writes                                    */
/* -------------------------------------------------------------------------- */

/**
 * Allocate the next human-facing order number.
 *
 * Backed by a Postgres sequence rather than `max(order_number) + 1` or `count(*) + 1`.
 * Sequences are transactional-safe under concurrency: two simultaneous orders can never
 * receive the same number, which a read-then-increment would eventually allow.
 */
export async function nextOrderNumber(db: Database): Promise<string> {
  const rows = await db.execute<{ value: string }>(
    sql`select nextval('order_number_seq')::text as value`,
  )
  const value = rows[0]?.value
  if (!value) throw new Error('order_number_seq returned no value')
  return `ORD-${value}`
}

export type InsertOrderInput = {
  orderNumber: string
  customerId: string
  status: OrderStatus
  type: OrderRow['type']
  subtotalCents: number
  taxCents: number
  serviceFeeCents: number
  totalCents: number
  notes: string | null
  /** Set when the order is auto-accepted at creation. */
  acceptedAt: Date | null
  lines: (Omit<NewOrderItemRow, 'orderId'> & { menuItemId: string })[]
}

/**
 * Insert an order and its lines atomically.
 *
 * The transaction is the point: an order row without its items is a corrupt record that
 * would render as a $0 order with no contents. Either both land or neither does.
 */
export async function insertOrderWithItems(
  db: Database,
  input: InsertOrderInput,
): Promise<OrderDetailRow> {
  return db.transaction(async (tx) => {
    const [order] = await tx
      .insert(orders)
      .values({
        orderNumber: input.orderNumber,
        customerId: input.customerId,
        status: input.status,
        type: input.type,
        subtotalCents: input.subtotalCents,
        taxCents: input.taxCents,
        serviceFeeCents: input.serviceFeeCents,
        totalCents: input.totalCents,
        notes: input.notes,
        acceptedAt: input.acceptedAt,
      })
      .returning()

    if (!order) throw new Error('Order insert returned no row')

    // A single multi-row insert, not one insert per line.
    await tx.insert(orderItems).values(
      input.lines.map((line) => ({
        ...line,
        orderId: order.id,
      })),
    )

    const [customer] = await tx
      .select(customerRefColumns)
      .from(customers)
      .where(eq(customers.id, order.customerId))
      .limit(1)

    if (!customer) throw new Error('Order created for a customer that does not exist')

    const items = await tx
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id))
      .orderBy(asc(orderItems.nameSnapshot))

    return { ...order, customer, items }
  })
}

/**
 * Apply a validated status transition.
 *
 * `expectedCurrentStatus` is included in the WHERE clause, making this a compare-and-set:
 * if another operator advanced the order between our read and this write, zero rows match
 * and the caller can surface a conflict instead of silently clobbering their change.
 * Without it, two operators clicking "Accept" and "Cancel" simultaneously would race.
 */
export async function applyOrderTransition(
  db: Database,
  id: string,
  expectedCurrentStatus: OrderStatus,
  values: Partial<OrderRow>,
): Promise<OrderRow | undefined> {
  const [row] = await db
    .update(orders)
    .set({ ...values, updatedAt: new Date() })
    .where(and(eq(orders.id, id), eq(orders.status, expectedCurrentStatus)))
    .returning()

  return row
}

/* -------------------------------------------------------------------------- */
/*                              Customer resolution                            */
/* -------------------------------------------------------------------------- */

export async function findCustomerById(db: Database, id: string) {
  const [row] = await db.select().from(customers).where(eq(customers.id, id)).limit(1)
  return row
}

/** Case-insensitive lookup, matching the `lower(email)` unique index. */
export async function findCustomerByEmail(db: Database, email: string) {
  const [row] = await db
    .select()
    .from(customers)
    .where(sql`lower(${customers.email}) = lower(${email})`)
    .limit(1)
  return row
}

export async function insertCustomer(
  db: Database,
  values: { name: string; email: string; phone?: string | null },
) {
  const [row] = await db.insert(customers).values(values).returning()
  if (!row) throw new Error('Customer insert returned no row')
  return row
}

/** Unique menu item ids in a request, so pricing needs exactly one query. */
export function collectMenuItemIds(lines: CreateOrderLine[]): string[] {
  return [...new Set(lines.map((line) => line.menuItemId))]
}

/**
 * Re-exported so the order service depends on a single repository module.
 *
 * Pricing an order genuinely needs menu rows, and duplicating that query here would be
 * two implementations of the same read drifting apart over time.
 */
export { findItemsByIds as findMenuItemsByIds } from './menu.repository'
