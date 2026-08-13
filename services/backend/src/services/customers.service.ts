/**
 * Customer business rules.
 *
 * Services are the only layer that throws `AppError`. Handlers stay thin (parse, call,
 * respond) and repositories stay dumb (SQL only), so every rule below is stated exactly
 * once and is unit-testable without HTTP.
 *
 * Note what is *absent*: there is no `deleteCustomer`. Orders reference customers with
 * `onDelete: 'restrict'`, and a customer record is the only thing tying an order history
 * to a person — deleting it would either be refused by the database or, if cascaded,
 * silently destroy revenue history. Customers are corrected via PATCH, never removed.
 */
import type {
  CreateCustomerRequest,
  CustomerListQuery,
  UpdateCustomerRequest,
} from '@odyssey/types'
import { buildPaginationMeta } from '@odyssey/types'

import type { Database } from '../db/client'
import { conflict, notFound } from '../lib/errors'
import { toCustomer, toCustomerWithStats } from '../mappers'
import * as repo from '../repositories/customers.repository'

/**
 * The CRM table: a page of customers, each carrying lifetime aggregates.
 *
 * All filtering, sorting and aggregation happen in SQL (see the repository). This
 * function deliberately does no arithmetic — `averageOrderValueCents` is derived inside
 * the mapper from the two integer values the database returned, so the average can never
 * disagree with the count and total shown beside it.
 */
export async function listCustomers(db: Database, query: CustomerListQuery) {
  const { rows, total } = await repo.listWithStats(db, query)
  return {
    data: rows.map(toCustomerWithStats),
    pagination: buildPaginationMeta(total, query),
  }
}

/**
 * A single customer, with the same aggregates the list shows.
 *
 * The detail view returns stats rather than a bare customer because the CRM drawer opens
 * straight onto "lifetime value" — returning `Customer` here would force the dashboard
 * into a second request to render the panel it always renders.
 */
export async function getCustomer(db: Database, id: string) {
  const row = await repo.findByIdWithStats(db, id)
  if (!row) throw notFound('Customer', id)
  return toCustomerWithStats(row)
}

/**
 * Email is unique case-insensitively.
 *
 * The database enforces it with a unique index on `lower(email)`, which is the real
 * guarantee. Checking first is about the *response*: a raw constraint violation would
 * escape as an unhandled driver error and be reported as a 500, telling the operator
 * nothing. A pre-check turns it into a 409 that names the offending field, which the
 * dashboard can attach to the email input.
 *
 * This check is not a substitute for the index — two concurrent creates can both pass it
 * — but in that race the index still refuses the second write, so the invariant holds
 * and only the error copy degrades.
 *
 * The email is stored exactly as typed. Only the *comparison* is case-insensitive;
 * normalising to lowercase on write would quietly rewrite a customer's own spelling of
 * their address for no benefit the index does not already provide.
 */
export async function createCustomer(db: Database, input: CreateCustomerRequest) {
  const existing = await repo.findByEmail(db, input.email)
  if (existing) {
    throw conflict(`A customer with the email '${input.email}' already exists.`, [
      { path: 'email', message: 'must be unique' },
    ])
  }

  return toCustomer(await repo.insert(db, input))
}

/**
 * Partial update. Only the fields present in the body are written.
 *
 * The uniqueness check is skipped entirely when the body omits `email`, so re-saving a
 * customer without touching their address cannot conflict with itself. When `email` is
 * present, a match is only a conflict if it belongs to a *different* customer —
 * submitting a customer's own address back unchanged (or in different casing) is a no-op,
 * not a 409.
 *
 * The result is mapped to `Customer` rather than `CustomerWithStats`: an update touches
 * no orders, so recomputing the aggregate join here would be a second query returning
 * numbers the caller already has.
 */
export async function updateCustomer(db: Database, id: string, input: UpdateCustomerRequest) {
  if (input.email) {
    const existing = await repo.findByEmail(db, input.email)
    if (existing && existing.id !== id) {
      throw conflict(`A customer with the email '${input.email}' already exists.`, [
        { path: 'email', message: 'must be unique' },
      ])
    }
  }

  const row = await repo.updateById(db, id, input)
  if (!row) throw notFound('Customer', id)
  return toCustomer(row)
}
