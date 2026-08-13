/**
 * Order business logic — the heart of the backend.
 *
 * Two guarantees this module exists to provide:
 *
 * 1. **The client never sets money.** A create request carries menu item ids and
 *    quantities. This service resolves the current price of each item from the database,
 *    applies the tax and service rates from settings, and computes every monetary field.
 *    A client-supplied `expectedTotalCents` is treated as an assertion to verify, never
 *    as an input to trust.
 *
 * 2. **The client never sets status.** There is no code path that writes an arbitrary
 *    status. Every change goes through `transitionOrder`, which consults the state
 *    machine in `@odyssey/types/domain` and refuses anything it does not permit.
 *
 * Both rules are enforced here rather than in the route layer, so they hold for any
 * caller — HTTP handler, seed script, or future queue consumer.
 */
import type {
  CreateOrderLine,
  CreateOrderRequest,
  OrderAction,
  OrderListQuery,
  OrderStatus,
  TransitionOrderRequest,
} from '@odyssey/types'
import {
  ORDER_TRANSITIONS,
  buildPaginationMeta,
  calculateOrderTotals,
  getAvailableActions,
  resolveTransition,
} from '@odyssey/types'
import type { MenuItemRow, OrderRow } from '@odyssey/types/db'

import type { Database } from '../db/client'
import {
  belowMinimum,
  conflict,
  invalidTransition,
  itemUnavailable,
  notFound,
  ordersDisabled,
  totalMismatch,
  validationFailed,
} from '../lib/errors'
import { toOrderDetail, toOrderSummary } from '../mappers'
import * as repo from '../repositories/orders.repository'
import { getSettings } from '../repositories/settings.repository'

/* -------------------------------------------------------------------------- */
/*                                    Reads                                    */
/* -------------------------------------------------------------------------- */

export async function listOrders(db: Database, query: OrderListQuery) {
  const { rows, total } = await repo.listOrders(db, query)
  return {
    data: rows.map(toOrderSummary),
    pagination: buildPaginationMeta(total, query),
  }
}

export async function getOrder(db: Database, id: string) {
  const row = await repo.findOrderDetailById(db, id)
  if (!row) throw notFound('Order', id)
  return toOrderDetail(row)
}

/* -------------------------------------------------------------------------- */
/*                                   Creation                                  */
/* -------------------------------------------------------------------------- */

/**
 * Resolve the customer an order belongs to.
 *
 * For `mode: 'new'`, an existing customer with the same email is reused rather than
 * rejected. A unique index on `lower(email)` means a blind insert would fail, and the
 * operator's intent ("take an order for this person") is satisfied either way — creating
 * a duplicate customer record would fragment their CRM history, which is worse.
 */
async function resolveCustomerId(
  db: Database,
  input: CreateOrderRequest['customer'],
): Promise<string> {
  if (input.mode === 'existing') {
    const customer = await repo.findCustomerById(db, input.customerId)
    if (!customer) throw notFound('Customer', input.customerId)
    return customer.id
  }

  const existing = await repo.findCustomerByEmail(db, input.email)
  if (existing) return existing.id

  const created = await repo.insertCustomer(db, {
    name: input.name,
    email: input.email,
    phone: input.phone ?? null,
  })
  return created.id
}

/**
 * Turn requested lines into priced lines, rejecting anything that cannot be ordered.
 *
 * Prices are read from the database at this moment and snapshotted onto the order, so a
 * later menu price change never rewrites history.
 */
function priceLines(lines: CreateOrderLine[], itemsById: Map<string, MenuItemRow>) {
  const missing: string[] = []
  const unavailable: string[] = []

  for (const line of lines) {
    const item = itemsById.get(line.menuItemId)
    if (!item) {
      missing.push(line.menuItemId)
    } else if (!item.isAvailable) {
      unavailable.push(item.name)
    }
  }

  // Report every problem at once. Rejecting one item at a time would make an operator
  // resubmit repeatedly to discover a second unavailable item.
  if (missing.length > 0) {
    throw notFound('Menu item', missing.join(', '))
  }
  if (unavailable.length > 0) {
    throw itemUnavailable(unavailable)
  }

  return lines.map((line) => {
    // Safe: the loop above proved every id resolves.
    const item = itemsById.get(line.menuItemId) as MenuItemRow
    return {
      menuItemId: item.id,
      nameSnapshot: item.name,
      unitPriceCents: item.priceCents,
      quantity: line.quantity,
      lineTotalCents: item.priceCents * line.quantity,
      notes: line.notes ?? null,
    }
  })
}

export async function createOrder(db: Database, input: CreateOrderRequest) {
  const settings = await getSettings(db)

  // The master switch is checked before any other work — if the kitchen is closed there
  // is nothing to validate.
  if (!settings.isAcceptingOrders) {
    throw ordersDisabled()
  }

  // Duplicate menu items in one payload would produce two lines for the same product.
  // Reject rather than silently merging, so the operator's intent stays explicit.
  const uniqueIds = repo.collectMenuItemIds(input.items)
  if (uniqueIds.length !== input.items.length) {
    throw validationFailed('The same menu item appears more than once. Combine it into one line.', [
      { path: 'items', message: 'duplicate menuItemId' },
    ])
  }

  const menuItems = await repo.findMenuItemsByIds(db, uniqueIds)
  const itemsById = new Map(menuItems.map((item) => [item.id, item]))

  const pricedLines = priceLines(input.items, itemsById)

  const totals = calculateOrderTotals(pricedLines, {
    taxRateBps: settings.taxRateBps,
    serviceFeeBps: settings.serviceFeeBps,
  })

  if (totals.subtotalCents < settings.minimumOrderCents) {
    throw belowMinimum(totals.subtotalCents, settings.minimumOrderCents)
  }

  /**
   * Verify the client's arithmetic if it offered one.
   *
   * A mismatch means the dashboard priced the cart from a stale menu. Failing loudly is
   * the only safe option: silently charging the server total would bill a customer an
   * amount nobody agreed to, and trusting the client total would let a crafted request
   * set its own price.
   */
  if (input.expectedTotalCents !== undefined && input.expectedTotalCents !== totals.totalCents) {
    throw totalMismatch(input.expectedTotalCents, totals.totalCents)
  }

  const customerId = await resolveCustomerId(db, input.customer)

  /**
   * Auto-accept short-circuits the pending step for restaurants that do not triage
   * incoming orders. The resulting status is still a legal state-machine state, and the
   * acceptedAt timestamp is stamped so the audit trail stays truthful.
   */
  const autoAccepted = settings.autoAcceptOrders
  const now = new Date()

  const created = await repo.insertOrderWithItems(db, {
    orderNumber: await repo.nextOrderNumber(db),
    customerId,
    status: autoAccepted ? 'accepted' : 'pending',
    type: input.type,
    subtotalCents: totals.subtotalCents,
    taxCents: totals.taxCents,
    serviceFeeCents: totals.serviceFeeCents,
    totalCents: totals.totalCents,
    notes: input.notes ?? null,
    acceptedAt: autoAccepted ? now : null,
    lines: pricedLines,
  })

  return toOrderDetail(created)
}

/* -------------------------------------------------------------------------- */
/*                                 Transitions                                 */
/* -------------------------------------------------------------------------- */

/** Column stamped when an order enters each status. */
const TIMESTAMP_COLUMN: Record<OrderStatus, keyof OrderRow | null> = {
  pending: null, // stamped at creation as placedAt
  accepted: 'acceptedAt',
  preparing: 'preparingAt',
  ready: 'readyAt',
  completed: 'completedAt',
  cancelled: 'cancelledAt',
}

/**
 * Move an order through its lifecycle.
 *
 * The action is validated against the state machine *before* any write, and the write
 * itself is a compare-and-set against the status we validated. Two operators acting on
 * the same order at the same time cannot both succeed.
 */
export async function transitionOrder(
  db: Database,
  id: string,
  input: TransitionOrderRequest,
) {
  const order = await repo.findOrderById(db, id)
  if (!order) throw notFound('Order', id)

  const action: OrderAction = input.action
  const nextStatus = resolveTransition(order.status, action)

  // The single authoritative rejection point for an illegal lifecycle change.
  if (nextStatus === null) {
    throw invalidTransition(order.status, action, getAvailableActions(order.status))
  }

  const rule = ORDER_TRANSITIONS[action]
  if (rule.requiresReason && !input.reason) {
    throw validationFailed('A reason is required to cancel an order.', [
      { path: 'reason', message: 'required when cancelling' },
    ])
  }

  const timestampColumn = TIMESTAMP_COLUMN[nextStatus]
  const values: Partial<OrderRow> = {
    status: nextStatus,
    ...(timestampColumn ? { [timestampColumn]: new Date() } : {}),
    ...(action === 'cancel' ? { cancellationReason: input.reason ?? null } : {}),
  }

  const updated = await repo.applyOrderTransition(db, id, order.status, values)

  /**
   * Zero rows updated means the status changed between our read and our write — another
   * operator got there first. Surfacing this as a conflict (rather than retrying or
   * reporting success) is what makes concurrent kitchen use safe.
   */
  if (!updated) {
    throw conflict(
      'This order was updated by someone else. Refresh to see its current status.',
      [{ path: 'status', message: 'changed concurrently' }],
    )
  }

  return getOrder(db, id)
}
