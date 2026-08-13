/**
 * Backend test configuration.
 *
 * Tests run against a REAL Postgres (`restaurant_test`), not a mock or an in-memory
 * substitute. The behaviour under test — enum constraints, unique indexes, sequences,
 * transactional rollback, aggregate SQL — is behaviour the *database* provides. A mocked
 * repository would assert that our fake behaves like our fake.
 *
 * The suite is deliberately single-threaded: every test truncates and reseeds shared
 * tables, so parallel files would race on the same rows.
 */
import { createRequire } from 'node:module'

import { defineConfig } from 'vitest/config'

const require = createRequire(import.meta.url)

/**
 * The single physical zod module, resolved from disk.
 *
 * `dedupe` alone is insufficient here: Vitest inlines workspace packages (`@odyssey/types`
 * ships TypeScript source) while treating `zod` from node_modules as external, and the two
 * resolution paths can produce separate module instances of the same physical package.
 * An explicit alias to one resolved path removes the ambiguity entirely.
 */
const zodPath = require.resolve('zod')

export default defineConfig({
  /**
   * `dedupe: ['zod']` is load-bearing, not tidiness.
   *
   * `extendZodWithOpenApi(z)` patches the zod schema prototype. Because the workspace
   * pins one zod version, the runtime and wrangler both resolve a single instance and the
   * patch reaches the schemas drizzle-zod built. Vitest's resolver, however, will happily
   * hand `@odyssey/types` and `services/backend` separate module instances of the same
   * physical package — at which point the patch lands on one copy and
   * `apiErrorSchema.openapi(...)` is undefined on the other.
   *
   * Deduping forces a single instance inside the test runner too. See docs/dependency-notes.md.
   */
  resolve: {
    dedupe: ['zod'],
    alias: [{ find: /^zod$/, replacement: zodPath }],
  },
  ssr: {
    // Same reasoning as `resolve.dedupe`, applied to Vitest's SSR resolution path.
    noExternal: [/^zod$/, /@hono\/zod-openapi/, /@asteasolutions\/zod-to-openapi/, /^@odyssey\//],
  },
  test: {
    /**
     * Everything that touches the zod prototype must go through ONE module pipeline.
     *
     * `@hono/zod-openapi` patches zod on import (it calls `extendZodWithOpenApi(zodModule.z)`
     * at module scope). If Vitest externalizes that package to Node while inlining
     * `@odyssey/types` through Vite's transform, the two see different module registries:
     * the patch lands on one zod and the contract schemas inherit from the other, so
     * `.openapi()` is undefined. Inlining them together keeps a single instance.
     */
    server: {
      deps: {
        inline: [/^zod$/, /@hono\/zod-openapi/, /@asteasolutions\/zod-to-openapi/, /^@odyssey\//],
      },
    },
    environment: 'node',
    globals: false,
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
    // Sequential: tests share one database and reset it between cases.
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
})
