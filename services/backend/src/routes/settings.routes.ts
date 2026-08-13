/**
 * Settings HTTP routes.
 *
 * Follows the reference pattern in menu.routes.ts: `createRoute(...)` declares the
 * contract (and *is* the OpenAPI document), the handler validates via `c.req.valid(...)`
 * and delegates. No SQL, no business logic.
 *
 * Settings are a singleton document, so there is no collection and no `{id}` path — the
 * resource lives at `/settings` and is addressed directly. The repository materialises
 * the row on first read, which is why neither route declares a 404: the document always
 * exists, even against a database that has only just been migrated.
 */
import { createRoute, type OpenAPIHono } from '@hono/zod-openapi'

import type { AppEnv } from '../env'
import { RestaurantSettingsSchema, UpdateSettingsRequestSchema } from '../openapi/registry'
import { baseErrorResponses, jsonContent } from '../openapi/responses'
import * as settingsService from '../services/settings.service'

const TAG = 'Settings'

const getSettingsRoute = createRoute({
  method: 'get',
  path: '/settings',
  tags: [TAG],
  summary: 'Get restaurant settings',
  operationId: 'getSettings',
  description:
    'Always succeeds. On a database that has never been written to, the default ' +
    'settings row is created and returned, so the dashboard has no empty state to ' +
    'handle here.',
  responses: {
    200: jsonContent(RestaurantSettingsSchema, 'The current restaurant settings.'),
    ...baseErrorResponses,
  },
})

const updateSettingsRoute = createRoute({
  method: 'patch',
  path: '/settings',
  tags: [TAG],
  summary: 'Update restaurant settings',
  operationId: 'updateSettings',
  description:
    'Partial update — only the fields present in the body are written; everything else ' +
    'keeps its current value. `id` and the internal singleton marker are server-owned ' +
    'and are not accepted. Rejected with 400 if `openingHours` lists a weekday twice, ' +
    'a constraint the request schema cannot express.',
  request: {
    body: { content: { 'application/json': { schema: UpdateSettingsRequestSchema } } },
  },
  responses: {
    200: jsonContent(RestaurantSettingsSchema, 'The updated settings.'),
    ...baseErrorResponses,
  },
})

/* -------------------------------------------------------------------------- */
/*                                  Handlers                                   */
/* -------------------------------------------------------------------------- */

export function registerSettingsRoutes(app: OpenAPIHono<AppEnv>) {
  app.openapi(getSettingsRoute, async (c) => {
    return c.json(await settingsService.getSettings(c.var.db), 200)
  })

  app.openapi(updateSettingsRoute, async (c) => {
    const body = c.req.valid('json')
    return c.json(await settingsService.updateSettings(c.var.db, body), 200)
  })
}
