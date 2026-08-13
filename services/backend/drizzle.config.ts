/**
 * drizzle-kit configuration.
 *
 * The schema deliberately lives in `@odyssey/types` rather than in this service:
 * the table definitions are the contract source that drizzle-zod derives from, so they
 * belong to the shared package. Migration *lifecycle* (generate / apply / seed) is an
 * operational concern and stays here, because the backend is the only process that
 * ever talks to the database.
 */
import { config } from 'dotenv'
import { defineConfig } from 'drizzle-kit'

// Load the repo-root .env so a single file configures every workspace package.
config({ path: '../../.env', quiet: true })

const databaseUrl = process.env.DATABASE_URL

if (!databaseUrl) {
  throw new Error(
    'DATABASE_URL is not set. Copy .env.example to .env at the repo root:\n' +
      '  cp .env.example .env',
  )
}

export default defineConfig({
  dialect: 'postgresql',
  schema: '../../packages/types/src/db/schema.ts',
  out: './drizzle',
  dbCredentials: { url: databaseUrl },
  // Surface exactly what will run before it runs.
  verbose: true,
  strict: true,
})
