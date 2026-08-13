/**
 * Stats HTTP routes.
 *
 * Follows the reference pattern in menu.routes.ts: `createRoute(...)` declares the
 * contract and *is* the OpenAPI document; the handler validates nothing itself, computes
 * nothing itself, and simply hands the parsed query to the service.
 *
 * The dashboard's entire header is one endpoint rather than a KPI-per-request fan-out.
 * Six round trips from a browser would each open their own Worker-scoped database
 * connection and could observe the database at six different instants — the totals would
 * not reconcile with the chart. One request, one connection, one consistent snapshot.
 */
import { createRoute, type OpenAPIHono } from '@hono/zod-openapi'

import { statsQuerySchema } from '@odyssey/types'

import type { AppEnv } from '../env'
import { DashboardOverviewSchema } from '../openapi/registry'
import { baseErrorResponses, jsonContent } from '../openapi/responses'
import * as statsService from '../services/stats.service'

const TAG = 'Stats'

/**
 * `range` is the only input, and it is a closed enum with a default, so the route has no
 * 404 or 409 branch — every valid range describes a window that exists, even when it
 * contains no orders. An unknown value is rejected as a 400 by the app-wide
 * `defaultHook`, which is already covered by `baseErrorResponses`.
 */
const getDashboardOverviewRoute = createRoute({
  method: 'get',
  path: '/stats/overview',
  tags: [TAG],
  summary: 'Dashboard KPIs for a time range',
  operationId: 'getDashboardOverview',
  description:
    'Every figure is aggregated in SQL — the dashboard renders this payload and performs ' +
    'no arithmetic of its own.\n\n' +
    'Cancelled orders are excluded from `totalOrders`, `revenueCents` and ' +
    '`averageOrderValueCents`, but are still reported in `ordersByStatus` so ' +
    'cancellations remain visible.\n\n' +
    '`pendingOrders` and `inProgressOrders` are live queue depths and are deliberately ' +
    'NOT scoped to `range`: an order placed last week that nobody has accepted is still ' +
    'pending today.\n\n' +
    '`revenueTrend` is bucketed hourly for `today` and daily otherwise, and always ' +
    'includes buckets with no orders so a chart cannot interpolate across a quiet ' +
    'period. `ordersByStatus` always contains every status, including those with a ' +
    'count of zero.',
  request: { query: statsQuerySchema },
  responses: {
    200: jsonContent(DashboardOverviewSchema, 'Aggregated KPIs for the requested range.'),
    ...baseErrorResponses,
  },
})

/* -------------------------------------------------------------------------- */
/*                                  Handlers                                   */
/* -------------------------------------------------------------------------- */

export function registerStatsRoutes(app: OpenAPIHono<AppEnv>) {
  app.openapi(getDashboardOverviewRoute, async (c) => {
    const query = c.req.valid('query')
    return c.json(await statsService.getDashboardOverview(c.var.db, query), 200)
  })
}
