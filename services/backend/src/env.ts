/**
 * The Worker's runtime contract: what Cloudflare injects, and what request-scoped
 * values middleware attaches.
 *
 * Every Hono generic in this service is parameterised with `AppEnv`, so a handler that
 * reads `c.var.db` or `c.env.DATABASE_URL` is type-checked against this one definition.
 */
import type { Database } from './db/client'

export type Bindings = {
  /**
   * Postgres connection string.
   *
   * Local dev reads it from `[vars]` in wrangler.toml (or `.dev.vars` if present);
   * production reads it from an encrypted Worker secret.
   */
  DATABASE_URL: string
  /** Allowed CORS origin. `*` locally; a concrete dashboard origin in production. */
  CORS_ORIGIN?: string
}

export type Variables = {
  /** Request-scoped Drizzle instance, attached by the database middleware. */
  db: Database
}

export type AppEnv = {
  Bindings: Bindings
  Variables: Variables
}
