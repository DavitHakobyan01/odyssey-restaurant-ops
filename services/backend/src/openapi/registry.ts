/**
 * The bridge between the contract package and the OpenAPI document.
 *
 * `@odyssey/types` exports plain zod schemas with no knowledge of HTTP or OpenAPI.
 * This module is the single place that gives them component names, so the emitted
 * document contains `#/components/schemas/MenuItem` rather than the same shape inlined
 * at a dozen call sites — which is also what makes Orval generate one shared
 * `MenuItem` type instead of a dozen anonymous duplicates.
 *
 * IMPORTANT: `extendZodWithOpenApi(z)` must run before any `.openapi()` call. It is
 * invoked here, and every route module imports its schemas from this file, so the
 * ordering is structural rather than something a future edit can accidentally break.
 */
import { extendZodWithOpenApi } from '@hono/zod-openapi'
import { z } from 'zod'

import {
  apiErrorSchema,
  createCustomerRequestSchema,
  createMenuCategoryRequestSchema,
  createMenuItemRequestSchema,
  createOrderRequestSchema,
  customerSchema,
  customerWithStatsSchema,
  dashboardOverviewSchema,
  menuCategorySchema,
  menuCategoryWithItemsSchema,
  menuItemSchema,
  menuItemWithCategorySchema,
  orderDetailSchema,
  orderItemSchema,
  orderSummarySchema,
  paginationMetaSchema,
  restaurantSettingsSchema,
  transitionOrderRequestSchema,
  updateCustomerRequestSchema,
  updateMenuCategoryRequestSchema,
  updateMenuItemRequestSchema,
  updateSettingsRequestSchema,
} from '@odyssey/types'

// Adds `.openapi()` to the shared zod instance. The workspace pins exactly one copy of
// zod (see docs/dependency-notes.md), so this also applies to the schemas drizzle-zod
// built — which is the whole reason the generated document carries real column
// constraints instead of bare `type: string`.
extendZodWithOpenApi(z)

/* --------------------------------- Shared --------------------------------- */

export const ApiErrorSchema = apiErrorSchema.openapi('ApiError')
export const PaginationMetaSchema = paginationMetaSchema.openapi('PaginationMeta')

/**
 * Wrap an item schema in the list envelope and register it under a stable name.
 * Naming each concrete instantiation is what stops Orval emitting
 * `PaginatedOrderSummary200`-style noise.
 */
export function registerPaginated<T extends z.ZodType>(item: T, name: string) {
  return z
    .object({
      data: z.array(item),
      pagination: PaginationMetaSchema,
    })
    .openapi(name)
}

/* ---------------------------------- Menu ---------------------------------- */

export const MenuCategorySchema = menuCategorySchema.openapi('MenuCategory')
export const MenuItemSchema = menuItemSchema.openapi('MenuItem')
export const MenuItemWithCategorySchema = menuItemWithCategorySchema.openapi('MenuItemWithCategory')
export const MenuCategoryWithItemsSchema =
  menuCategoryWithItemsSchema.openapi('MenuCategoryWithItems')
export const CreateMenuCategoryRequestSchema = createMenuCategoryRequestSchema.openapi(
  'CreateMenuCategoryRequest',
)
export const UpdateMenuCategoryRequestSchema = updateMenuCategoryRequestSchema.openapi(
  'UpdateMenuCategoryRequest',
)
export const CreateMenuItemRequestSchema =
  createMenuItemRequestSchema.openapi('CreateMenuItemRequest')
export const UpdateMenuItemRequestSchema =
  updateMenuItemRequestSchema.openapi('UpdateMenuItemRequest')

/* -------------------------------- Customers -------------------------------- */

export const CustomerSchema = customerSchema.openapi('Customer')
export const CustomerWithStatsSchema = customerWithStatsSchema.openapi('CustomerWithStats')
export const CreateCustomerRequestSchema =
  createCustomerRequestSchema.openapi('CreateCustomerRequest')
export const UpdateCustomerRequestSchema =
  updateCustomerRequestSchema.openapi('UpdateCustomerRequest')

/* ---------------------------------- Orders --------------------------------- */

export const OrderItemSchema = orderItemSchema.openapi('OrderItem')
export const OrderSummarySchema = orderSummarySchema.openapi('OrderSummary')
export const OrderDetailSchema = orderDetailSchema.openapi('OrderDetail')
export const CreateOrderRequestSchema = createOrderRequestSchema.openapi('CreateOrderRequest')
export const TransitionOrderRequestSchema = transitionOrderRequestSchema.openapi(
  'TransitionOrderRequest',
)

/* --------------------------------- Settings -------------------------------- */

export const RestaurantSettingsSchema = restaurantSettingsSchema.openapi('RestaurantSettings')
export const UpdateSettingsRequestSchema =
  updateSettingsRequestSchema.openapi('UpdateSettingsRequest')

/* ---------------------------------- Stats ---------------------------------- */

export const DashboardOverviewSchema = dashboardOverviewSchema.openapi('DashboardOverview')

export { z }
