/**
 * `@odyssey/types` — the contract layer.
 *
 * Three entry points, deliberately separated:
 *
 *   @odyssey/types          contracts (zod schemas + inferred types). Backend + tooling.
 *   @odyssey/types/db       raw Drizzle tables. Backend only.
 *   @odyssey/types/domain   dependency-free domain rules. Safe for the RN/web bundle.
 *
 * The dashboard imports its API DTOs from `@odyssey/api-client` (Orval-generated) and
 * its lifecycle rules from `@odyssey/types/domain`. It never imports this root entry,
 * which would pull drizzle-orm into the client bundle.
 */
export * from './contracts/common'
export * from './contracts/customers'
export * from './contracts/menu'
export * from './contracts/orders'
export * from './contracts/settings'
export * from './contracts/stats'
export * from './domain/order-status'
