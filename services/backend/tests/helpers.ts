/**
 * Test helpers.
 *
 * Requests go through `createApp()` — the exact application the Worker exports. Routing,
 * zod request validation, the database middleware, the error handler and the response
 * shaping are all exercised. Calling a service function directly would skip the layers
 * where most real bugs live.
 */
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import { calculateOrderTotals } from '@odyssey/types'
import {
  customers,
  menuCategories,
  menuItems,
  orderItems,
  orders,
  restaurantSettings,
} from '@odyssey/types/db'

import { createApp } from '../src/app'
import { TEST_DATABASE_URL } from './setup'

const app = createApp()

/** Bindings the Worker would normally receive from Cloudflare. */
const testEnv = { DATABASE_URL: TEST_DATABASE_URL, CORS_ORIGIN: '*' }

export type ApiResponse<T> = { status: number; body: T }

/** Issue a request against the real app and parse the response. */
export async function request<T = unknown>(
  path: string,
  init?: RequestInit,
): Promise<ApiResponse<T>> {
  const response = await app.request(
    `http://localhost${path}`,
    {
      ...init,
      headers: {
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    },
    testEnv,
  )

  const text = await response.text()
  return {
    status: response.status,
    body: (text ? JSON.parse(text) : undefined) as T,
  }
}

export const post = <T>(path: string, body: unknown) =>
  request<T>(path, { method: 'POST', body: JSON.stringify(body) })

export const patch = <T>(path: string, body: unknown) =>
  request<T>(path, { method: 'PATCH', body: JSON.stringify(body) })

export const del = <T>(path: string) => request<T>(path, { method: 'DELETE' })

/* -------------------------------------------------------------------------- */
/*                                  Fixtures                                   */
/* -------------------------------------------------------------------------- */

export type Fixtures = {
  categoryId: string
  /** $9.00, available. */
  availableItemId: string
  availablePriceCents: number
  /** $12.50, marked unavailable. */
  unavailableItemId: string
  customerId: string
  taxRateBps: number
  serviceFeeBps: number
}

const client = postgres(TEST_DATABASE_URL, { max: 1 })
const db = drizzle(client)

/**
 * Reset to a known state.
 *
 * Truncating rather than rolling back a transaction: the app opens its own connection
 * per request, so it would never see writes made inside an uncommitted test transaction.
 */
export async function resetDatabase(): Promise<Fixtures> {
  await db.execute(
    sql`truncate table ${orderItems}, ${orders}, ${menuItems}, ${menuCategories}, ${customers}, ${restaurantSettings} restart identity cascade`,
  )
  await db.execute(sql`alter sequence order_number_seq restart with 1001`)

  const taxRateBps = 875
  const serviceFeeBps = 500

  await db.insert(restaurantSettings).values({
    restaurantName: 'Test Kitchen',
    currency: 'USD',
    isAcceptingOrders: true,
    autoAcceptOrders: false,
    defaultPrepTimeMinutes: 20,
    taxRateBps,
    serviceFeeBps,
    minimumOrderCents: 0,
    openingHours: [],
  })

  const [category] = await db
    .insert(menuCategories)
    .values({ name: 'Test category', sortOrder: 10, isActive: true })
    .returning()
  if (!category) throw new Error('fixture: category insert failed')

  const [available] = await db
    .insert(menuItems)
    .values({
      categoryId: category.id,
      name: 'Available dish',
      priceCents: 900,
      isAvailable: true,
    })
    .returning()
  if (!available) throw new Error('fixture: available item insert failed')

  const [unavailable] = await db
    .insert(menuItems)
    .values({
      categoryId: category.id,
      name: 'Sold out dish',
      priceCents: 1250,
      isAvailable: false,
    })
    .returning()
  if (!unavailable) throw new Error('fixture: unavailable item insert failed')

  const [customer] = await db
    .insert(customers)
    .values({ name: 'Test Customer', email: 'test.customer@example.com' })
    .returning()
  if (!customer) throw new Error('fixture: customer insert failed')

  return {
    categoryId: category.id,
    availableItemId: available.id,
    availablePriceCents: available.priceCents,
    unavailableItemId: unavailable.id,
    customerId: customer.id,
    taxRateBps,
    serviceFeeBps,
  }
}

export async function setSettings(values: Record<string, unknown>) {
  await patch('/settings', values)
}

/** Expected totals for N units of the fixture item, via the production pricing function. */
export function expectedTotals(fixtures: Fixtures, quantity: number) {
  return calculateOrderTotals(
    [{ unitPriceCents: fixtures.availablePriceCents, quantity }],
    { taxRateBps: fixtures.taxRateBps, serviceFeeBps: fixtures.serviceFeeBps },
  )
}

export async function closeTestDb() {
  await client.end()
}
