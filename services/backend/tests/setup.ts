/**
 * Test bootstrap: migrate the dedicated test database once, before any test runs.
 *
 * `restaurant_test` is a separate database from the development one, so running the
 * suite never destroys the seeded data a reviewer is looking at in the dashboard.
 */
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { beforeAll } from 'vitest'

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://odyssey:odyssey@localhost:5432/restaurant_test'

beforeAll(async () => {
  const client = postgres(TEST_DATABASE_URL, { max: 1 })
  try {
    await migrate(drizzle(client), {
      migrationsFolder: resolve(dirname(fileURLToPath(import.meta.url)), '../drizzle'),
    })
  } catch (error) {
    throw new Error(
      `Could not migrate the test database at ${TEST_DATABASE_URL}.\n` +
        `Create it with:\n` +
        `  createdb restaurant_test  (or: docker compose exec postgres createdb -U odyssey restaurant_test)\n\n` +
        `Original error: ${error instanceof Error ? error.message : String(error)}`,
    )
  } finally {
    await client.end()
  }
})
