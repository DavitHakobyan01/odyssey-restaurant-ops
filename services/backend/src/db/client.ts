/**
 * Database access for the Worker runtime.
 *
 * Driver choice
 * -------------
 * `postgres-js` over a raw TCP socket (enabled by the `nodejs_compat` flag) rather than
 * a vendor-specific HTTP driver such as `@neondatabase/serverless`.
 *
 * The tradeoff is deliberate: an HTTP driver would give slightly cheaper cold connects
 * on Neon specifically, but it would couple the data layer to one provider. With
 * postgres-js the identical code path runs against a local Docker Postgres, a Homebrew
 * Postgres, an RDS instance, or a Neon pooled URL — only `DATABASE_URL` changes. For a
 * project that must be trivially reviewable on a laptop *and* deployable to Cloudflare,
 * that portability is worth more than the last few milliseconds.
 *
 * Connection lifecycle
 * --------------------
 * A Worker isolate may serve many concurrent requests, and a Postgres connection is not
 * safe to share across them once transactions are involved. So a client is created per
 * request with `max: 1` and closed when the response is done.
 *
 * That means one connect per request, which is the honest cost of this approach. The
 * production answer is Cloudflare Hyperdrive (or any external pooler such as PgBouncer)
 * sitting in front of Postgres — it keeps a warm pool on Cloudflare's edge and requires
 * no code change here beyond pointing `DATABASE_URL` at the Hyperdrive binding. This is
 * called out in docs/tradeoffs.md rather than hidden.
 */
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import * as schema from '@odyssey/types/db'

/**
 * Drizzle instance typed with the full schema, which is what enables the relational
 * query API (`db.query.orders.findMany({ with: { items: true } })`) to be type-safe.
 */
export type Database = PostgresJsDatabase<typeof schema>

export type DatabaseConnection = {
  db: Database
  /** Releases the underlying socket. Always call this once the response is built. */
  close: () => Promise<void>
}

export function createDatabase(databaseUrl: string): DatabaseConnection {
  const client = postgres(databaseUrl, {
    // One socket per request; the isolate does not multiplex.
    max: 1,
    // postgres-js otherwise issues a catalogue introspection query on every new
    // connection to learn custom type OIDs. We use only built-in types, so this is
    // a pure round trip of wasted latency on a per-request connection.
    fetch_types: false,
    // Fail fast rather than hanging a Worker request on an unreachable database.
    connect_timeout: 10,
    idle_timeout: 20,
  })

  return {
    db: drizzle(client, { schema }),
    close: () => client.end({ timeout: 5 }),
  }
}
