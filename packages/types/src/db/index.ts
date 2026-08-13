/**
 * Backend-only entry point.
 *
 * This exports the raw Drizzle tables and is intentionally NOT re-exported from the
 * package root, so the React Native / web bundle never pulls drizzle-orm in.
 */
export * from './schema'
