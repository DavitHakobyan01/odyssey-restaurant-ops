/**
 * Building blocks shared by every contract.
 *
 * These are plain zod schemas — deliberately free of any `@hono/zod-openapi` import.
 * Naming schemas as OpenAPI components is an HTTP-layer concern, so the backend applies
 * `.openapi('Name')` when it registers routes. That keeps this package framework-agnostic
 * and testable without spinning up Hono.
 */
import { z } from 'zod'

/**
 * Timestamps cross the wire as ISO-8601 strings, never as `Date`.
 *
 * drizzle-zod types timestamp columns as `z.date()`, which is correct for the database
 * row but wrong for a JSON contract. Response schemas override those columns with this,
 * and the mapper layer performs the conversion explicitly — so the documented contract
 * and the runtime schema always agree.
 */
export const isoDateTime = z.iso.datetime({ offset: true })

/** Nullable ISO timestamp, used for the order lifecycle columns. */
export const nullableIsoDateTime = isoDateTime.nullable()

export const uuidSchema = z.uuid()

/** Path parameter shared by every `/:id` route. */
export const idParamSchema = z.object({
  id: uuidSchema,
})

export type IdParam = z.infer<typeof idParamSchema>

/* -------------------------------------------------------------------------- */
/*                                 Pagination                                  */
/* -------------------------------------------------------------------------- */

/**
 * Query values arrive as strings, so these coerce. Bounds are enforced here rather
 * than in handlers — an unbounded `limit` is a trivial way to melt a database.
 */
export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
})

export type PaginationQuery = z.infer<typeof paginationQuerySchema>

export const paginationMetaSchema = z.object({
  total: z.number().int().min(0),
  limit: z.number().int().min(1),
  offset: z.number().int().min(0),
  hasMore: z.boolean(),
})

export type PaginationMeta = z.infer<typeof paginationMetaSchema>

/** Wrap any item schema in the standard list envelope. */
export function paginated<T extends z.ZodType>(item: T) {
  return z.object({
    data: z.array(item),
    pagination: paginationMetaSchema,
  })
}

export function buildPaginationMeta(
  total: number,
  { limit, offset }: PaginationQuery,
): PaginationMeta {
  return { total, limit, offset, hasMore: offset + limit < total }
}

/* -------------------------------------------------------------------------- */
/*                                   Errors                                    */
/* -------------------------------------------------------------------------- */

/**
 * A closed set of failure modes. The frontend switches on `code`, never on message
 * text, so copy can change without breaking behaviour.
 */
export const API_ERROR_CODES = [
  'VALIDATION_ERROR',
  'NOT_FOUND',
  'CONFLICT',
  'INVALID_TRANSITION',
  'ITEM_UNAVAILABLE',
  'ORDERS_DISABLED',
  'BELOW_MINIMUM',
  'TOTAL_MISMATCH',
  'INTERNAL_ERROR',
] as const

export type ApiErrorCode = (typeof API_ERROR_CODES)[number]

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.enum(API_ERROR_CODES),
    message: z.string(),
    /** Field-level detail for VALIDATION_ERROR, or contextual data for domain errors. */
    details: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  }),
})

export type ApiError = z.infer<typeof apiErrorSchema>

/* -------------------------------------------------------------------------- */
/*                                   Sorting                                   */
/* -------------------------------------------------------------------------- */

export const sortDirectionSchema = z.enum(['asc', 'desc'])

export type SortDirection = z.infer<typeof sortDirectionSchema>
