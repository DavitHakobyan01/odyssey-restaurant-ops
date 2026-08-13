/**
 * Customer contracts, including the aggregated shape the CRM page consumes.
 *
 * Order count / lifetime spend are computed in SQL rather than by loading every order
 * into memory — see `CustomerRepository.listWithStats`.
 */
import { createInsertSchema, createSelectSchema } from 'drizzle-zod'
import { z } from 'zod'

import { customers } from '../db/schema'
import { isoDateTime, nullableIsoDateTime, paginationQuerySchema } from './common'

export const customerSchema = createSelectSchema(customers, {
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
})

export type Customer = z.infer<typeof customerSchema>

export const createCustomerRequestSchema = createInsertSchema(customers, {
  name: (schema) => schema.trim().min(1, 'Name is required').max(160),
  email: () => z.email('Enter a valid email address').max(254),
  phone: (schema) => schema.trim().min(5).max(40).nullable().optional(),
}).omit({ id: true, createdAt: true, updatedAt: true })

export type CreateCustomerRequest = z.infer<typeof createCustomerRequestSchema>

export const updateCustomerRequestSchema = createCustomerRequestSchema.partial()

export type UpdateCustomerRequest = z.infer<typeof updateCustomerRequestSchema>

/* -------------------------------------------------------------------------- */
/*                              Aggregated reads                               */
/* -------------------------------------------------------------------------- */

/** CRM list row: the customer plus their lifetime aggregates. */
export const customerWithStatsSchema = customerSchema.extend({
  orderCount: z.number().int().min(0),
  /** Lifetime spend in minor units. Cancelled orders are excluded. */
  totalSpentCents: z.number().int().min(0),
  averageOrderValueCents: z.number().int().min(0),
  lastOrderAt: nullableIsoDateTime,
})

export type CustomerWithStats = z.infer<typeof customerWithStatsSchema>

export const customerListQuerySchema = paginationQuerySchema.extend({
  /** Case-insensitive match against name or email. */
  search: z.string().trim().min(1).max(160).optional(),
  sortBy: z.enum(['name', 'totalSpent', 'orderCount', 'lastOrderAt']).default('lastOrderAt'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
})

export type CustomerListQuery = z.infer<typeof customerListQuerySchema>
