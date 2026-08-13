/**
 * Customer HTTP routes (CRM).
 *
 * Follows the reference pattern in menu.routes.ts: `createRoute(...)` declares the
 * contract — method, path, request schemas, every response shape — and the handler does
 * nothing but hand validated input to a service. No SQL, no business rules here.
 *
 * There is intentionally no `DELETE /customers/{id}`. Orders reference customers with
 * `onDelete: 'restrict'`, and deleting a customer would mean deleting the only link
 * between an order history and the person who placed it. Records are corrected with
 * PATCH; they are never removed. Omitting the route (rather than adding one that always
 * 409s) keeps the absence visible in the generated OpenAPI document and client.
 */
import { createRoute, type OpenAPIHono } from '@hono/zod-openapi'

import { customerListQuerySchema } from '@odyssey/types'

import type { AppEnv } from '../env'
import { IdParamSchema } from '../openapi/params'
import {
  CreateCustomerRequestSchema,
  CustomerSchema,
  CustomerWithStatsSchema,
  UpdateCustomerRequestSchema,
  registerPaginated,
} from '../openapi/registry'
import {
  baseErrorResponses,
  conflictResponse,
  jsonContent,
  notFoundResponse,
} from '../openapi/responses'
import * as customerService from '../services/customers.service'

const TAG = 'Customers'

/**
 * Naming the concrete list envelope keeps `PaginatedCustomers` a single named component
 * in the document, so Orval emits one shared type instead of an anonymous inline shape
 * per operation.
 */
const PaginatedCustomersSchema = registerPaginated(CustomerWithStatsSchema, 'PaginatedCustomers')

const listCustomersRoute = createRoute({
  method: 'get',
  path: '/customers',
  tags: [TAG],
  summary: 'List customers with lifetime stats',
  operationId: 'listCustomers',
  description:
    'Order count, lifetime spend and last-order date are aggregated in SQL, and sorting ' +
    'by any of them sorts the whole table rather than the current page. Cancelled orders ' +
    'are excluded from every aggregate.',
  request: { query: customerListQuerySchema },
  responses: {
    200: jsonContent(PaginatedCustomersSchema, 'A page of customers with their aggregates.'),
    ...baseErrorResponses,
  },
})

const getCustomerRoute = createRoute({
  method: 'get',
  path: '/customers/{id}',
  tags: [TAG],
  summary: 'Get a customer with lifetime stats',
  operationId: 'getCustomer',
  description:
    'Returns the same aggregates as the list endpoint, so the CRM detail panel renders ' +
    'from one request.',
  request: { params: IdParamSchema },
  responses: {
    200: jsonContent(CustomerWithStatsSchema, 'The customer and their aggregates.'),
    ...notFoundResponse,
    ...baseErrorResponses,
  },
})

const createCustomerRoute = createRoute({
  method: 'post',
  path: '/customers',
  tags: [TAG],
  summary: 'Create a customer',
  operationId: 'createCustomer',
  description: 'Refused with 409 when the email already belongs to another customer.',
  request: {
    body: { content: { 'application/json': { schema: CreateCustomerRequestSchema } } },
  },
  responses: {
    201: jsonContent(CustomerSchema, 'The created customer.'),
    ...conflictResponse,
    ...baseErrorResponses,
  },
})

const updateCustomerRoute = createRoute({
  method: 'patch',
  path: '/customers/{id}',
  tags: [TAG],
  summary: 'Update a customer',
  operationId: 'updateCustomer',
  description:
    'Partial update. Aggregates are omitted from the response because an update cannot ' +
    'change them.',
  request: {
    params: IdParamSchema,
    body: { content: { 'application/json': { schema: UpdateCustomerRequestSchema } } },
  },
  responses: {
    200: jsonContent(CustomerSchema, 'The updated customer.'),
    ...notFoundResponse,
    ...conflictResponse,
    ...baseErrorResponses,
  },
})

/* -------------------------------------------------------------------------- */
/*                                  Handlers                                   */
/* -------------------------------------------------------------------------- */

export function registerCustomerRoutes(app: OpenAPIHono<AppEnv>) {
  app.openapi(listCustomersRoute, async (c) => {
    const query = c.req.valid('query')
    return c.json(await customerService.listCustomers(c.var.db, query), 200)
  })

  app.openapi(getCustomerRoute, async (c) => {
    const { id } = c.req.valid('param')
    return c.json(await customerService.getCustomer(c.var.db, id), 200)
  })

  app.openapi(createCustomerRoute, async (c) => {
    const body = c.req.valid('json')
    return c.json(await customerService.createCustomer(c.var.db, body), 201)
  })

  app.openapi(updateCustomerRoute, async (c) => {
    const { id } = c.req.valid('param')
    const body = c.req.valid('json')
    return c.json(await customerService.updateCustomer(c.var.db, id, body), 200)
  })
}
