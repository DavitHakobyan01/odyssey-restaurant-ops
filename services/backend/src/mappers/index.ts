/**
 * Row -> DTO mappers.
 *
 * Drizzle returns `Date` objects for timestamp columns; the API contract declares
 * ISO-8601 strings (see `isoDateTime` in @odyssey/types). This layer performs that
 * conversion explicitly rather than relying on `JSON.stringify` to do it implicitly.
 *
 * That explicitness is the point: the response the handler builds actually satisfies the
 * zod schema the OpenAPI document was generated from, so contract tests can validate
 * real handler output instead of trusting serialisation to line up by accident.
 */
import type {
  Customer,
  CustomerWithStats,
  MenuCategory,
  MenuCategoryWithItems,
  MenuItem,
  OrderDetail,
  OrderItem,
  OrderSummary,
  RestaurantSettings,
} from '@odyssey/types'
import { getAvailableActions } from '@odyssey/types'
import type {
  CustomerRow,
  MenuCategoryRow,
  MenuItemRow,
  OrderItemRow,
  OrderRow,
  RestaurantSettingsRow,
} from '@odyssey/types/db'

/**
 * Timestamp columns selected normally arrive as `Date`. Aggregates written as raw `sql`
 * fragments bypass Drizzle's type parsing and arrive as driver strings instead.
 *
 * Repositories are expected to fix that at the source with `.mapWith(column)` — and they
 * do — but accepting both here means a future raw-SQL aggregate degrades into a correct
 * ISO string rather than a 500 from `.toISOString is not a function`. The contract is
 * satisfied either way, which is the point: the API's output shape should not depend on
 * which query style produced the row.
 */
export const toIso = (value: Date | string): string =>
  typeof value === 'string' ? new Date(value).toISOString() : value.toISOString()

export const toIsoOrNull = (value: Date | string | null): string | null =>
  value === null || value === undefined ? null : toIso(value)

/* ---------------------------------- Menu ---------------------------------- */

export function toMenuCategory(row: MenuCategoryRow): MenuCategory {
  return {
    ...row,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  }
}

export function toMenuItem(row: MenuItemRow): MenuItem {
  return {
    ...row,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  }
}

export function toMenuCategoryWithItems(
  row: MenuCategoryRow & { items: MenuItemRow[] },
): MenuCategoryWithItems {
  return {
    ...toMenuCategory(row),
    items: row.items.map(toMenuItem),
  }
}

/* -------------------------------- Customers -------------------------------- */

export function toCustomer(row: CustomerRow): Customer {
  return {
    ...row,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  }
}

export type CustomerStatsRow = CustomerRow & {
  orderCount: number
  totalSpentCents: number
  lastOrderAt: Date | string | null
}

export function toCustomerWithStats(row: CustomerStatsRow): CustomerWithStats {
  return {
    ...toCustomer(row),
    orderCount: row.orderCount,
    totalSpentCents: row.totalSpentCents,
    // Integer division, floored — an average is display-only and must stay an integer
    // number of cents to satisfy the contract.
    averageOrderValueCents:
      row.orderCount > 0 ? Math.floor(row.totalSpentCents / row.orderCount) : 0,
    lastOrderAt: toIsoOrNull(row.lastOrderAt),
  }
}

/* ---------------------------------- Orders --------------------------------- */

export function toOrderItem(row: OrderItemRow): OrderItem {
  return {
    ...row,
    createdAt: toIso(row.createdAt),
  }
}

type OrderCustomerRef = { id: string; name: string; email: string }

function toOrderTimestamps(row: OrderRow) {
  return {
    placedAt: toIso(row.placedAt),
    acceptedAt: toIsoOrNull(row.acceptedAt),
    preparingAt: toIsoOrNull(row.preparingAt),
    readyAt: toIsoOrNull(row.readyAt),
    completedAt: toIsoOrNull(row.completedAt),
    cancelledAt: toIsoOrNull(row.cancelledAt),
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  }
}

export function toOrderSummary(
  row: OrderRow & { customer: OrderCustomerRef; itemCount: number },
): OrderSummary {
  const { notes: _notes, cancellationReason: _reason, ...rest } = row
  return {
    ...rest,
    ...toOrderTimestamps(row),
    customer: row.customer,
    itemCount: row.itemCount,
  }
}

/**
 * `availableActions` is derived here from the persisted status using the same state
 * machine the transition endpoint enforces. The UI renders exactly these buttons, so
 * what the operator can click and what the server will accept cannot disagree.
 */
export function toOrderDetail(
  row: OrderRow & { customer: OrderCustomerRef; items: OrderItemRow[] },
): OrderDetail {
  return {
    ...row,
    ...toOrderTimestamps(row),
    customer: row.customer,
    items: row.items.map(toOrderItem),
    availableActions: getAvailableActions(row.status),
  }
}

/* --------------------------------- Settings -------------------------------- */

export function toRestaurantSettings(row: RestaurantSettingsRow): RestaurantSettings {
  const { singletonLock: _lock, ...rest } = row
  return {
    ...rest,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  }
}
