/**
 * Order contracts.
 *
 * Two deliberate choices show up here:
 *
 * 1. There is no writable `status` field anywhere in a request schema. Status changes
 *    go through `POST /orders/:id/transition` with a named *action*, which the server
 *    validates against the state machine. A client cannot assert that an order is now
 *    `completed`; it can only ask to `complete` one, and be refused.
 *
 * 2. Requests carry no money. The client sends menu item ids and quantities; the server
 *    resolves current prices, applies tax and service fee, and computes every total.
 *    `expectedTotalCents` is optional and advisory — if the client's arithmetic disagrees
 *    with the server's, the order is rejected with TOTAL_MISMATCH rather than silently
 *    charging a different amount.
 */
import { createSelectSchema } from 'drizzle-zod'
import { z } from 'zod'

import { orderItems, orders } from '../db/schema'
import { ORDER_ACTIONS, ORDER_STATUSES, ORDER_TYPES } from '../domain/order-status'
import {
  isoDateTime,
  nullableIsoDateTime,
  paginationQuerySchema,
  uuidSchema,
} from './common'

/* -------------------------------------------------------------------------- */
/*                                  Responses                                  */
/* -------------------------------------------------------------------------- */

export const orderItemSchema = createSelectSchema(orderItems, {
  createdAt: isoDateTime,
})

export type OrderItem = z.infer<typeof orderItemSchema>

const orderBaseSchema = createSelectSchema(orders, {
  placedAt: isoDateTime,
  acceptedAt: nullableIsoDateTime,
  preparingAt: nullableIsoDateTime,
  readyAt: nullableIsoDateTime,
  completedAt: nullableIsoDateTime,
  cancelledAt: nullableIsoDateTime,
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
})

/** Compact customer reference embedded in order responses. */
const orderCustomerRefSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  email: z.string(),
})

/** List row — enough to render the Orders table without a second request. */
export const orderSummarySchema = orderBaseSchema
  .omit({ notes: true, cancellationReason: true })
  .extend({
    customer: orderCustomerRefSchema,
    itemCount: z.number().int().min(0),
  })

export type OrderSummary = z.infer<typeof orderSummarySchema>

/**
 * Detail view. `availableActions` is computed server-side from the current status, so
 * the UI renders exactly the buttons the backend will actually honour — one source of
 * truth for the lifecycle, not a client-side guess that can drift.
 */
export const orderDetailSchema = orderBaseSchema.extend({
  customer: orderCustomerRefSchema,
  items: z.array(orderItemSchema),
  availableActions: z.array(z.enum(ORDER_ACTIONS)),
})

export type OrderDetail = z.infer<typeof orderDetailSchema>

/* -------------------------------------------------------------------------- */
/*                               Create request                                */
/* -------------------------------------------------------------------------- */

export const createOrderLineSchema = z.object({
  menuItemId: uuidSchema,
  quantity: z.number().int().min(1, 'Quantity must be at least 1').max(99),
  notes: z.string().trim().max(280).nullable().optional(),
})

export type CreateOrderLine = z.infer<typeof createOrderLineSchema>

/**
 * An order can be placed for an existing customer or create one inline.
 * Modelled as a discriminated union so the generated OpenAPI carries a real `oneOf`
 * with a discriminator, and the generated client type is exhaustively checkable.
 */
export const orderCustomerInputSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('existing'),
    customerId: uuidSchema,
  }),
  z.object({
    mode: z.literal('new'),
    name: z.string().trim().min(1, 'Name is required').max(160),
    email: z.email('Enter a valid email address').max(254),
    phone: z.string().trim().min(5).max(40).nullable().optional(),
  }),
])

export type OrderCustomerInput = z.infer<typeof orderCustomerInputSchema>

export const createOrderRequestSchema = z.object({
  customer: orderCustomerInputSchema,
  type: z.enum(ORDER_TYPES).default('takeaway'),
  items: z.array(createOrderLineSchema).min(1, 'An order needs at least one item'),
  notes: z.string().trim().max(500).nullable().optional(),
  /**
   * Optional client-side total for verification only. Never used to price the order.
   * A mismatch is rejected — it means the client was working from a stale menu.
   */
  expectedTotalCents: z.number().int().min(0).optional(),
})

export type CreateOrderRequest = z.infer<typeof createOrderRequestSchema>

/* -------------------------------------------------------------------------- */
/*                             Transition request                              */
/* -------------------------------------------------------------------------- */

export const transitionOrderRequestSchema = z.object({
  action: z.enum(ORDER_ACTIONS),
  /** Required by the state machine when cancelling. */
  reason: z.string().trim().min(1).max(280).optional(),
})

export type TransitionOrderRequest = z.infer<typeof transitionOrderRequestSchema>

/* -------------------------------------------------------------------------- */
/*                                   Queries                                   */
/* -------------------------------------------------------------------------- */

/**
 * `status` accepts a repeated query parameter (?status=pending&status=accepted) so the
 * Orders page can filter on several states at once. A bare single value is coerced into
 * a one-element array.
 */
export const orderListQuerySchema = paginationQuerySchema.extend({
  status: z
    .union([z.enum(ORDER_STATUSES), z.array(z.enum(ORDER_STATUSES))])
    .transform((value) => (Array.isArray(value) ? value : [value]))
    .optional(),
  type: z.enum(ORDER_TYPES).optional(),
  customerId: uuidSchema.optional(),
  /** Matches order number or customer name/email. */
  search: z.string().trim().min(1).max(160).optional(),
  placedFrom: z.iso.datetime({ offset: true }).optional(),
  placedTo: z.iso.datetime({ offset: true }).optional(),
  sortBy: z.enum(['placedAt', 'totalCents', 'status']).default('placedAt'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
})

export type OrderListQuery = z.infer<typeof orderListQuerySchema>
