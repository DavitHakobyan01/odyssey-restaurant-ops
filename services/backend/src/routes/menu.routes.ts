/**
 * Menu HTTP routes.
 *
 * This module is the reference pattern every other route module follows:
 *
 *   1. `createRoute(...)` declares the contract — method, path, request schemas,
 *      every response shape. This declaration *is* the OpenAPI document; there is no
 *      second place where the API is described.
 *   2. The handler parses via `c.req.valid(...)`, which is already validated and fully
 *      typed by the route definition, delegates to a service, and returns.
 *
 * Handlers contain no business logic and no SQL. If a rule needs stating, it belongs in
 * the service; if a query needs writing, it belongs in the repository.
 */
import { createRoute, type OpenAPIHono } from '@hono/zod-openapi'

import { menuItemListQuerySchema } from '@odyssey/types'

import type { AppEnv } from '../env'
import { IdParamSchema } from '../openapi/params'
import {
  CreateMenuCategoryRequestSchema,
  CreateMenuItemRequestSchema,
  MenuCategorySchema,
  MenuCategoryWithItemsSchema,
  MenuItemSchema,
  UpdateMenuCategoryRequestSchema,
  UpdateMenuItemRequestSchema,
  registerPaginated,
  z,
} from '../openapi/registry'
import {
  baseErrorResponses,
  conflictResponse,
  jsonContent,
  notFoundResponse,
} from '../openapi/responses'
import * as menuService from '../services/menu.service'

const TAG = 'Menu'

const MenuItemWithCategoryListSchema = registerPaginated(
  MenuItemSchema.extend({
    category: MenuCategorySchema.pick({ id: true, name: true }),
  }),
  'PaginatedMenuItems',
)

/**
 * `includeInactive` is a string in the query and must be coerced. `z.stringbool()`
 * accepts "true"/"false" (and 1/0, yes/no) and yields a real boolean.
 */
const IncludeInactiveQuerySchema = z.object({
  includeInactive: z.stringbool().default(false).openapi({
    param: { name: 'includeInactive', in: 'query', required: false },
    description: 'Include categories that are hidden from the live menu.',
  }),
})

/* -------------------------------------------------------------------------- */
/*                                 Categories                                  */
/* -------------------------------------------------------------------------- */

const listCategoriesRoute = createRoute({
  method: 'get',
  path: '/menu/categories',
  tags: [TAG],
  summary: 'List menu categories',
  operationId: 'listMenuCategories',
  request: { query: IncludeInactiveQuerySchema },
  responses: {
    200: jsonContent(z.array(MenuCategorySchema), 'Categories in display order.'),
    ...baseErrorResponses,
  },
})

const listCategoriesWithItemsRoute = createRoute({
  method: 'get',
  path: '/menu/full',
  tags: [TAG],
  summary: 'List categories with their items nested',
  operationId: 'listFullMenu',
  description:
    'Single-request payload for the Menu page. Avoids the N+1 the dashboard would ' +
    'otherwise perform fetching items per category.',
  request: { query: IncludeInactiveQuerySchema },
  responses: {
    200: jsonContent(z.array(MenuCategoryWithItemsSchema), 'Categories with nested items.'),
    ...baseErrorResponses,
  },
})

const createCategoryRoute = createRoute({
  method: 'post',
  path: '/menu/categories',
  tags: [TAG],
  summary: 'Create a menu category',
  operationId: 'createMenuCategory',
  request: {
    body: { content: { 'application/json': { schema: CreateMenuCategoryRequestSchema } } },
  },
  responses: {
    201: jsonContent(MenuCategorySchema, 'The created category.'),
    ...conflictResponse,
    ...baseErrorResponses,
  },
})

const updateCategoryRoute = createRoute({
  method: 'patch',
  path: '/menu/categories/{id}',
  tags: [TAG],
  summary: 'Update a menu category',
  operationId: 'updateMenuCategory',
  request: {
    params: IdParamSchema,
    body: { content: { 'application/json': { schema: UpdateMenuCategoryRequestSchema } } },
  },
  responses: {
    200: jsonContent(MenuCategorySchema, 'The updated category.'),
    ...notFoundResponse,
    ...conflictResponse,
    ...baseErrorResponses,
  },
})

const deleteCategoryRoute = createRoute({
  method: 'delete',
  path: '/menu/categories/{id}',
  tags: [TAG],
  summary: 'Delete an empty menu category',
  operationId: 'deleteMenuCategory',
  description: 'Refused with 409 while the category still contains items.',
  request: { params: IdParamSchema },
  responses: {
    204: { description: 'Category deleted.' },
    ...notFoundResponse,
    ...conflictResponse,
    ...baseErrorResponses,
  },
})

/* -------------------------------------------------------------------------- */
/*                                    Items                                    */
/* -------------------------------------------------------------------------- */

const listItemsRoute = createRoute({
  method: 'get',
  path: '/menu/items',
  tags: [TAG],
  summary: 'List menu items',
  operationId: 'listMenuItems',
  request: { query: menuItemListQuerySchema },
  responses: {
    200: jsonContent(MenuItemWithCategoryListSchema, 'A page of menu items.'),
    ...baseErrorResponses,
  },
})

const getItemRoute = createRoute({
  method: 'get',
  path: '/menu/items/{id}',
  tags: [TAG],
  summary: 'Get a menu item',
  operationId: 'getMenuItem',
  request: { params: IdParamSchema },
  responses: {
    200: jsonContent(MenuItemSchema, 'The menu item.'),
    ...notFoundResponse,
    ...baseErrorResponses,
  },
})

const createItemRoute = createRoute({
  method: 'post',
  path: '/menu/items',
  tags: [TAG],
  summary: 'Create a menu item',
  operationId: 'createMenuItem',
  request: {
    body: { content: { 'application/json': { schema: CreateMenuItemRequestSchema } } },
  },
  responses: {
    201: jsonContent(MenuItemSchema, 'The created item.'),
    ...notFoundResponse,
    ...baseErrorResponses,
  },
})

const updateItemRoute = createRoute({
  method: 'patch',
  path: '/menu/items/{id}',
  tags: [TAG],
  summary: 'Update a menu item',
  operationId: 'updateMenuItem',
  description:
    'Also the endpoint used to toggle availability, which is the supported way to take ' +
    'an item off the menu without destroying its order history.',
  request: {
    params: IdParamSchema,
    body: { content: { 'application/json': { schema: UpdateMenuItemRequestSchema } } },
  },
  responses: {
    200: jsonContent(MenuItemSchema, 'The updated item.'),
    ...notFoundResponse,
    ...baseErrorResponses,
  },
})

const deleteItemRoute = createRoute({
  method: 'delete',
  path: '/menu/items/{id}',
  tags: [TAG],
  summary: 'Delete a menu item',
  operationId: 'deleteMenuItem',
  description: 'Refused with 409 when the item appears on existing orders.',
  request: { params: IdParamSchema },
  responses: {
    204: { description: 'Item deleted.' },
    ...notFoundResponse,
    ...conflictResponse,
    ...baseErrorResponses,
  },
})

/* -------------------------------------------------------------------------- */
/*                                  Handlers                                   */
/* -------------------------------------------------------------------------- */

export function registerMenuRoutes(app: OpenAPIHono<AppEnv>) {
  app.openapi(listCategoriesRoute, async (c) => {
    const { includeInactive } = c.req.valid('query')
    return c.json(await menuService.listCategories(c.var.db, includeInactive), 200)
  })

  app.openapi(listCategoriesWithItemsRoute, async (c) => {
    const { includeInactive } = c.req.valid('query')
    return c.json(await menuService.listCategoriesWithItems(c.var.db, includeInactive), 200)
  })

  app.openapi(createCategoryRoute, async (c) => {
    const body = c.req.valid('json')
    return c.json(await menuService.createCategory(c.var.db, body), 201)
  })

  app.openapi(updateCategoryRoute, async (c) => {
    const { id } = c.req.valid('param')
    const body = c.req.valid('json')
    return c.json(await menuService.updateCategory(c.var.db, id, body), 200)
  })

  app.openapi(deleteCategoryRoute, async (c) => {
    const { id } = c.req.valid('param')
    await menuService.deleteCategory(c.var.db, id)
    return c.body(null, 204)
  })

  app.openapi(listItemsRoute, async (c) => {
    const query = c.req.valid('query')
    return c.json(await menuService.listItems(c.var.db, query), 200)
  })

  app.openapi(getItemRoute, async (c) => {
    const { id } = c.req.valid('param')
    return c.json(await menuService.getItem(c.var.db, id), 200)
  })

  app.openapi(createItemRoute, async (c) => {
    const body = c.req.valid('json')
    return c.json(await menuService.createItem(c.var.db, body), 201)
  })

  app.openapi(updateItemRoute, async (c) => {
    const { id } = c.req.valid('param')
    const body = c.req.valid('json')
    return c.json(await menuService.updateItem(c.var.db, id, body), 200)
  })

  app.openapi(deleteItemRoute, async (c) => {
    const { id } = c.req.valid('param')
    await menuService.deleteItem(c.var.db, id)
    return c.body(null, 204)
  })
}
