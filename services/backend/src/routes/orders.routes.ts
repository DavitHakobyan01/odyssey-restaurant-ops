/**
 * Order HTTP routes.
 *
 * Note what is absent: there is no `PATCH /orders/{id}` that accepts a `status` field.
 * The only way to change an order's state is `POST /orders/{id}/transition` with a named
 * action, which the service validates against the state machine. That asymmetry is
 * deliberate and is the reason the lifecycle is actually enforceable.
 */
import { createRoute, type OpenAPIHono } from '@hono/zod-openapi'

import { orderListQuerySchema } from '@odyssey/types'

import type { AppEnv } from '../env'
import { IdParamSchema } from '../openapi/params'
import {
  CreateOrderRequestSchema,
  OrderDetailSchema,
  OrderSummarySchema,
  TransitionOrderRequestSchema,
  registerPaginated,
} from '../openapi/registry'
import {
  baseErrorResponses,
  conflictResponse,
  jsonContent,
  notFoundResponse,
  unprocessableResponse,
} from '../openapi/responses'
import * as orderService from '../services/orders.service'

const TAG = 'Orders'

const PaginatedOrdersSchema = registerPaginated(OrderSummarySchema, 'PaginatedOrders')

const listOrdersRoute = createRoute({
  method: 'get',
  path: '/orders',
  tags: [TAG],
  summary: 'List orders',
  operationId: 'listOrders',
  description:
    'Supports filtering by status (repeatable), type, customer and placed-at range, ' +
    'plus free-text search across order number and customer name/email.',
  request: { query: orderListQuerySchema },
  responses: {
    200: jsonContent(PaginatedOrdersSchema, 'A page of orders.'),
    ...baseErrorResponses,
  },
})

const getOrderRoute = createRoute({
  method: 'get',
  path: '/orders/{id}',
  tags: [TAG],
  summary: 'Get order detail',
  operationId: 'getOrder',
  description:
    'Includes the order lines and `availableActions` — the exact set of transitions the ' +
    'server will currently accept, computed from the persisted status.',
  request: { params: IdParamSchema },
  responses: {
    200: jsonContent(OrderDetailSchema, 'The order, with items and available actions.'),
    ...notFoundResponse,
    ...baseErrorResponses,
  },
})

const createOrderRoute = createRoute({
  method: 'post',
  path: '/orders',
  tags: [TAG],
  summary: 'Create an order',
  operationId: 'createOrder',
  description:
    'Totals are computed server-side from current menu prices and the configured tax and ' +
    'service rates. The request carries no monetary values. An optional ' +
    '`expectedTotalCents` is verified and, if it disagrees, the order is rejected with ' +
    'TOTAL_MISMATCH rather than charged at a different amount.\n\n' +
    'Rejects: unavailable items (422), ordering switched off (422), subtotal below the ' +
    'configured minimum (422), and unknown menu items or customer (404).',
  request: {
    body: { content: { 'application/json': { schema: CreateOrderRequestSchema } } },
  },
  responses: {
    201: jsonContent(OrderDetailSchema, 'The created order.'),
    ...notFoundResponse,
    ...conflictResponse,
    ...unprocessableResponse,
    ...baseErrorResponses,
  },
})

const transitionOrderRoute = createRoute({
  method: 'post',
  path: '/orders/{id}/transition',
  tags: [TAG],
  summary: 'Advance an order through its lifecycle',
  operationId: 'transitionOrder',
  description:
    'The only way to change an order status. Takes an action — accept, start_preparing, ' +
    'mark_ready, complete or cancel — not a target status.\n\n' +
    'The action is validated against the order state machine; an action that is not legal ' +
    'from the current status is rejected with 409 INVALID_TRANSITION and a message listing ' +
    'what is currently permitted. Cancelling requires a reason. The write is a ' +
    'compare-and-set, so if another operator advanced the order first this returns 409 ' +
    'rather than overwriting their change.',
  request: {
    params: IdParamSchema,
    body: { content: { 'application/json': { schema: TransitionOrderRequestSchema } } },
  },
  responses: {
    200: jsonContent(OrderDetailSchema, 'The order after the transition.'),
    ...notFoundResponse,
    ...conflictResponse,
    ...baseErrorResponses,
  },
})

export function registerOrderRoutes(app: OpenAPIHono<AppEnv>) {
  app.openapi(listOrdersRoute, async (c) => {
    const query = c.req.valid('query')
    return c.json(await orderService.listOrders(c.var.db, query), 200)
  })

  app.openapi(getOrderRoute, async (c) => {
    const { id } = c.req.valid('param')
    return c.json(await orderService.getOrder(c.var.db, id), 200)
  })

  app.openapi(createOrderRoute, async (c) => {
    const body = c.req.valid('json')
    return c.json(await orderService.createOrder(c.var.db, body), 201)
  })

  app.openapi(transitionOrderRoute, async (c) => {
    const { id } = c.req.valid('param')
    const body = c.req.valid('json')
    return c.json(await orderService.transitionOrder(c.var.db, id, body), 200)
  })
}
