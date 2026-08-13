/**
 * `@odyssey/api-client` — the dashboard's only route to the backend.
 *
 * Everything under `src/generated/` is produced by Orval from the backend's
 * `openapi.json` and is never hand-edited (`pnpm gen:contract` wipes and rewrites it).
 * This file re-exports that output alongside the small amount of hand-written transport
 * code it depends on.
 *
 * The dashboard imports API types from here, never from `@odyssey/types` — that package
 * pulls in drizzle and describes the *database*, whereas these types describe the *wire
 * contract*. Keeping the distinction is what stops persistence details leaking into the
 * client bundle.
 *
 * Regenerate after any backend route or schema change:
 *
 *     pnpm gen:contract
 */

/* Generated request functions, React Query hooks and query-key factories. */
export * from './generated/endpoints/menu/menu'
export * from './generated/endpoints/orders/orders'
export * from './generated/endpoints/customers/customers'
export * from './generated/endpoints/settings/settings'
export * from './generated/endpoints/stats/stats'

/* Generated DTOs. */
export * from './generated/model'

/* Hand-written transport layer. */
export { ApiClientError, customFetch } from './http-client'
export type { ApiErrorDetail } from './http-client'
export { createQueryClient } from './query-client'
