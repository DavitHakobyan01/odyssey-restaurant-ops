/**
 * Application assembly.
 *
 * Kept separate from `index.ts` (the Worker entry) so tests and the OpenAPI emitter can
 * build the exact same app without a Cloudflare runtime. `emit-openapi.ts` importing
 * this file is what guarantees the committed `openapi.json` always describes the routes
 * that actually exist — the document cannot drift from the implementation, because it
 * is produced *from* the implementation.
 */
import { OpenAPIHono } from '@hono/zod-openapi'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import type { ZodError } from 'zod'

import { createDatabase } from './db/client'
import type { AppEnv } from './env'
import { AppError } from './lib/errors'
import { registerCustomerRoutes } from './routes/customers.routes'
import { registerMenuRoutes } from './routes/menu.routes'
import { registerOrderRoutes } from './routes/orders.routes'
import { registerSettingsRoutes } from './routes/settings.routes'
import { registerStatsRoutes } from './routes/stats.routes'

/**
 * Turn a zod failure into the same `{ error: { code, message, details } }` envelope
 * every other failure uses, so the client has exactly one error shape to handle.
 *
 * Wired as `defaultHook`, this runs for *every* route's request validation without each
 * handler remembering to check — validation cannot be skipped by omission.
 */
function formatValidationError(error: ZodError) {
  return {
    error: {
      code: 'VALIDATION_ERROR' as const,
      message: 'The request failed validation.',
      details: error.issues.map((issue) => ({
        path: issue.path.join('.') || '(root)',
        message: issue.message,
      })),
    },
  }
}

export function createApp() {
  const app = new OpenAPIHono<AppEnv>({
    defaultHook: (result, c) => {
      if (!result.success) {
        return c.json(formatValidationError(result.error), 400)
      }
      return undefined
    },
  })

  // Request logging is noise in the test runner, where hundreds of requests are made.
  if (process.env.NODE_ENV !== 'test') {
    app.use('*', logger())
  }

  app.use('*', (c, next) =>
    cors({
      origin: c.env.CORS_ORIGIN ?? '*',
      allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type'],
    })(c, next),
  )

  /**
   * Request-scoped database connection.
   *
   * Opened before the handler and closed in `finally`, so a thrown error can never leak
   * a socket. See db/client.ts for why the connection is per-request rather than shared.
   */
  app.use('*', async (c, next) => {
    const connection = createDatabase(c.env.DATABASE_URL)
    c.set('db', connection.db)
    try {
      await next()
    } finally {
      await connection.close()
    }
  })

  /* ----------------------------- Error handling ---------------------------- */

  app.onError((err, c) => {
    if (err instanceof AppError) {
      return c.json(err.toBody(), err.status)
    }

    // Anything reaching here is a bug, not a domain outcome. Log the real error for
    // observability but never return its message — it can contain connection strings
    // or query fragments.
    console.error('Unhandled error:', err)

    return c.json(
      {
        error: {
          code: 'INTERNAL_ERROR' as const,
          message: 'An unexpected error occurred.',
        },
      },
      500,
    )
  })

  app.notFound((c) =>
    c.json(
      {
        error: {
          code: 'NOT_FOUND' as const,
          message: `No route matches ${c.req.method} ${new URL(c.req.url).pathname}`,
        },
      },
      404,
    ),
  )

  /* -------------------------------- Routes -------------------------------- */

  app.get('/health', (c) => c.json({ status: 'ok' }))

  registerMenuRoutes(app)
  registerCustomerRoutes(app)
  registerOrderRoutes(app)
  registerSettingsRoutes(app)
  registerStatsRoutes(app)

  /* ------------------------------- Documents ------------------------------- */

  app.doc31('/openapi.json', openApiConfig)

  return app
}

/**
 * The OpenAPI document metadata.
 *
 * Exported so `scripts/emit-openapi.ts` produces a byte-identical document to the one
 * the running API serves at `/openapi.json`. One definition, two consumers — the
 * committed artifact can never describe a different API than the live one.
 */
export const openApiConfig = {
  openapi: '3.1.0',
  info: {
    title: 'Odyssey Restaurant Operations API',
    version: '0.1.0',
    description:
      'Ordering and menu management API.\n\n' +
      'Every schema in this document is derived from the Drizzle table definitions in ' +
      '`@odyssey/types` via drizzle-zod — it is generated, never hand-written. The ' +
      'dashboard consumes it through Orval-generated React Query hooks.\n\n' +
      'Order status is not a writable field. Lifecycle changes go through ' +
      '`POST /orders/{id}/transition` with a named action, validated server-side ' +
      'against the order state machine.',
  },
  servers: [{ url: 'http://localhost:8787', description: 'Local development' }],
  tags: [
    { name: 'Menu', description: 'Menu categories and items' },
    { name: 'Customers', description: 'Customer records and CRM aggregates' },
    { name: 'Orders', description: 'Order creation, filtering and lifecycle' },
    { name: 'Settings', description: 'Restaurant-wide ordering settings' },
    { name: 'Stats', description: 'Dashboard KPIs' },
  ],
}

export type App = ReturnType<typeof createApp>
