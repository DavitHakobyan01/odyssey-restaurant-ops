/**
 * Order flow tests — the behaviour the product depends on being correct.
 *
 * These run against a real Postgres through the real Hono app, so they cover routing,
 * zod validation, the state machine, SQL constraints and the error envelope together.
 *
 * The two properties every test here ultimately protects:
 *   - a client cannot set money
 *   - a client cannot set status
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import type { ApiError, OrderDetail, OrderSummary } from '@odyssey/types'

import {
  closeTestDb,
  expectedTotals,
  patch,
  post,
  request,
  resetDatabase,
  type Fixtures,
} from './helpers'

let fx: Fixtures

beforeEach(async () => {
  fx = await resetDatabase()
})

afterAll(async () => {
  await closeTestDb()
})

/** Place a valid order and return it. */
async function placeOrder(quantity = 2) {
  const response = await post<OrderDetail>('/orders', {
    customer: { mode: 'existing', customerId: fx.customerId },
    items: [{ menuItemId: fx.availableItemId, quantity }],
  })
  expect(response.status).toBe(201)
  return response.body
}

describe('POST /orders — server-side pricing', () => {
  it('computes every monetary field from current menu prices', async () => {
    const order = await placeOrder(3)
    const expected = expectedTotals(fx, 3)

    expect(order.subtotalCents).toBe(expected.subtotalCents)
    expect(order.taxCents).toBe(expected.taxCents)
    expect(order.serviceFeeCents).toBe(expected.serviceFeeCents)
    expect(order.totalCents).toBe(expected.totalCents)
    // The invariant that must always hold, whatever the rates are.
    expect(order.totalCents).toBe(
      order.subtotalCents + order.taxCents + order.serviceFeeCents,
    )
  })

  it('ignores monetary fields supplied by the client', async () => {
    const response = await post<OrderDetail>('/orders', {
      customer: { mode: 'existing', customerId: fx.customerId },
      items: [{ menuItemId: fx.availableItemId, quantity: 2 }],
      // A hostile or buggy client trying to price its own order.
      subtotalCents: 1,
      taxCents: 0,
      serviceFeeCents: 0,
      totalCents: 1,
    })

    const expected = expectedTotals(fx, 2)
    expect(response.status).toBe(201)
    expect(response.body.totalCents).toBe(expected.totalCents)
    expect(response.body.totalCents).not.toBe(1)
  })

  it('snapshots the price so later menu changes do not rewrite history', async () => {
    const order = await placeOrder(1)
    const originalTotal = order.totalCents

    await patch(`/menu/items/${fx.availableItemId}`, { priceCents: 5000 })

    const refetched = await request<OrderDetail>(`/orders/${order.id}`)
    expect(refetched.body.totalCents).toBe(originalTotal)
    expect(refetched.body.items[0]?.unitPriceCents).toBe(fx.availablePriceCents)
  })

  it('rejects a stale client total rather than silently charging a different amount', async () => {
    const response = await post<ApiError>('/orders', {
      customer: { mode: 'existing', customerId: fx.customerId },
      items: [{ menuItemId: fx.availableItemId, quantity: 2 }],
      expectedTotalCents: 1,
    })

    expect(response.status).toBe(409)
    expect(response.body.error.code).toBe('TOTAL_MISMATCH')
  })

  it('accepts a matching client total', async () => {
    const expected = expectedTotals(fx, 2)
    const response = await post<OrderDetail>('/orders', {
      customer: { mode: 'existing', customerId: fx.customerId },
      items: [{ menuItemId: fx.availableItemId, quantity: 2 }],
      expectedTotalCents: expected.totalCents,
    })

    expect(response.status).toBe(201)
  })
})

describe('POST /orders — validation and business rules', () => {
  it('rejects an unavailable menu item', async () => {
    const response = await post<ApiError>('/orders', {
      customer: { mode: 'existing', customerId: fx.customerId },
      items: [{ menuItemId: fx.unavailableItemId, quantity: 1 }],
    })

    expect(response.status).toBe(422)
    expect(response.body.error.code).toBe('ITEM_UNAVAILABLE')
    // The message names the item so the operator knows what to remove.
    expect(response.body.error.message).toContain('Sold out dish')
  })

  it('rejects an empty item list', async () => {
    const response = await post<ApiError>('/orders', {
      customer: { mode: 'existing', customerId: fx.customerId },
      items: [],
    })

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('rejects a zero or negative quantity', async () => {
    for (const quantity of [0, -1]) {
      const response = await post<ApiError>('/orders', {
        customer: { mode: 'existing', customerId: fx.customerId },
        items: [{ menuItemId: fx.availableItemId, quantity }],
      })
      expect(response.status).toBe(400)
    }
  })

  it('rejects an unknown customer', async () => {
    const response = await post<ApiError>('/orders', {
      customer: { mode: 'existing', customerId: '00000000-0000-4000-8000-000000000000' },
      items: [{ menuItemId: fx.availableItemId, quantity: 1 }],
    })

    expect(response.status).toBe(404)
    expect(response.body.error.code).toBe('NOT_FOUND')
  })

  it('rejects the same menu item appearing twice', async () => {
    const response = await post<ApiError>('/orders', {
      customer: { mode: 'existing', customerId: fx.customerId },
      items: [
        { menuItemId: fx.availableItemId, quantity: 1 },
        { menuItemId: fx.availableItemId, quantity: 2 },
      ],
    })

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('refuses all orders while ordering is switched off', async () => {
    await patch('/settings', { isAcceptingOrders: false })

    const response = await post<ApiError>('/orders', {
      customer: { mode: 'existing', customerId: fx.customerId },
      items: [{ menuItemId: fx.availableItemId, quantity: 1 }],
    })

    expect(response.status).toBe(422)
    expect(response.body.error.code).toBe('ORDERS_DISABLED')
  })

  it('enforces the configured minimum order value', async () => {
    await patch('/settings', { minimumOrderCents: 10_000 })

    const response = await post<ApiError>('/orders', {
      customer: { mode: 'existing', customerId: fx.customerId },
      items: [{ menuItemId: fx.availableItemId, quantity: 1 }],
    })

    expect(response.status).toBe(422)
    expect(response.body.error.code).toBe('BELOW_MINIMUM')
  })

  it('reuses an existing customer when an inline email already exists, case-insensitively', async () => {
    const first = await post<OrderDetail>('/orders', {
      customer: { mode: 'new', name: 'Inline Person', email: 'inline@example.com' },
      items: [{ menuItemId: fx.availableItemId, quantity: 1 }],
    })
    const second = await post<OrderDetail>('/orders', {
      customer: { mode: 'new', name: 'Different Name', email: 'INLINE@EXAMPLE.COM' },
      items: [{ menuItemId: fx.availableItemId, quantity: 1 }],
    })

    expect(second.body.customer.id).toBe(first.body.customer.id)
  })
})

describe('POST /orders — initial status', () => {
  it('starts pending, ignoring any status the client sends', async () => {
    const response = await post<OrderDetail>('/orders', {
      customer: { mode: 'existing', customerId: fx.customerId },
      items: [{ menuItemId: fx.availableItemId, quantity: 1 }],
      status: 'completed',
    })

    expect(response.body.status).toBe('pending')
    expect(response.body.acceptedAt).toBeNull()
  })

  it('starts accepted when auto-accept is enabled, and stamps acceptedAt', async () => {
    await patch('/settings', { autoAcceptOrders: true })

    const order = await placeOrder(1)
    expect(order.status).toBe('accepted')
    expect(order.acceptedAt).not.toBeNull()
  })

  it('allocates sequential, unique order numbers', async () => {
    const first = await placeOrder(1)
    const second = await placeOrder(1)

    expect(first.orderNumber).toMatch(/^ORD-\d+$/)
    expect(second.orderNumber).not.toBe(first.orderNumber)
  })
})

describe('POST /orders/:id/transition — the state machine', () => {
  it('walks the full happy path', async () => {
    const order = await placeOrder(1)

    const sequence = [
      ['accept', 'accepted'],
      ['start_preparing', 'preparing'],
      ['mark_ready', 'ready'],
      ['complete', 'completed'],
    ] as const

    for (const [action, expectedStatus] of sequence) {
      const response = await post<OrderDetail>(`/orders/${order.id}/transition`, { action })
      expect(response.status).toBe(200)
      expect(response.body.status).toBe(expectedStatus)
    }
  })

  it('refuses an action that is not legal from the current status', async () => {
    const order = await placeOrder(1)

    const response = await post<ApiError>(`/orders/${order.id}/transition`, {
      action: 'complete',
    })

    expect(response.status).toBe(409)
    expect(response.body.error.code).toBe('INVALID_TRANSITION')
    // The message tells the operator what they *can* do instead.
    expect(response.body.error.message).toContain('accept')
  })

  it('refuses any transition out of a terminal status', async () => {
    const order = await placeOrder(1)
    for (const action of ['accept', 'start_preparing', 'mark_ready', 'complete']) {
      await post(`/orders/${order.id}/transition`, { action })
    }

    const response = await post<ApiError>(`/orders/${order.id}/transition`, {
      action: 'cancel',
      reason: 'changed my mind',
    })

    expect(response.status).toBe(409)
    expect(response.body.error.code).toBe('INVALID_TRANSITION')
  })

  it('requires a reason to cancel', async () => {
    const order = await placeOrder(1)

    const withoutReason = await post<ApiError>(`/orders/${order.id}/transition`, {
      action: 'cancel',
    })
    expect(withoutReason.status).toBe(400)

    const withReason = await post<OrderDetail>(`/orders/${order.id}/transition`, {
      action: 'cancel',
      reason: 'Customer called to cancel',
    })
    expect(withReason.status).toBe(200)
    expect(withReason.body.status).toBe('cancelled')
    expect(withReason.body.cancellationReason).toBe('Customer called to cancel')
  })

  it('rejects an action outside the known set', async () => {
    const order = await placeOrder(1)

    const response = await post<ApiError>(`/orders/${order.id}/transition`, {
      action: 'teleport',
    })

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('stamps the lifecycle timestamp for each stage it passes through', async () => {
    const order = await placeOrder(1)

    await post(`/orders/${order.id}/transition`, { action: 'accept' })
    await post(`/orders/${order.id}/transition`, { action: 'start_preparing' })
    const ready = await post<OrderDetail>(`/orders/${order.id}/transition`, {
      action: 'mark_ready',
    })

    expect(ready.body.acceptedAt).not.toBeNull()
    expect(ready.body.preparingAt).not.toBeNull()
    expect(ready.body.readyAt).not.toBeNull()
    // Stages it never reached stay null — the audit trail must not lie.
    expect(ready.body.completedAt).toBeNull()
    expect(ready.body.cancelledAt).toBeNull()
  })

  it('reports availableActions that match what the server will accept', async () => {
    const order = await placeOrder(1)
    expect(order.availableActions).toEqual(['accept', 'cancel'])

    const accepted = await post<OrderDetail>(`/orders/${order.id}/transition`, {
      action: 'accept',
    })
    expect(accepted.body.availableActions).toEqual(['start_preparing', 'cancel'])

    // Every advertised action must actually succeed — this is the contract the UI relies
    // on when it renders one button per available action.
    for (const action of accepted.body.availableActions) {
      const fresh = await placeOrder(1)
      await post(`/orders/${fresh.id}/transition`, { action: 'accept' })
      const result = await post<OrderDetail>(`/orders/${fresh.id}/transition`, {
        action,
        reason: action === 'cancel' ? 'test' : undefined,
      })
      expect(result.status).toBe(200)
    }
  })

  it('returns 404 for an order that does not exist', async () => {
    const response = await post<ApiError>(
      '/orders/00000000-0000-4000-8000-000000000000/transition',
      { action: 'accept' },
    )
    expect(response.status).toBe(404)
  })
})

describe('GET /orders — listing and filtering', () => {
  it('filters by status', async () => {
    const first = await placeOrder(1)
    await placeOrder(1)
    await post(`/orders/${first.id}/transition`, { action: 'accept' })

    const accepted = await request<{ data: OrderSummary[] }>('/orders?status=accepted')
    expect(accepted.body.data).toHaveLength(1)
    expect(accepted.body.data[0]?.id).toBe(first.id)

    const pending = await request<{ data: OrderSummary[] }>('/orders?status=pending')
    expect(pending.body.data).toHaveLength(1)
  })

  it('accepts a repeated status parameter', async () => {
    const first = await placeOrder(1)
    await placeOrder(1)
    await post(`/orders/${first.id}/transition`, { action: 'accept' })

    const response = await request<{ data: OrderSummary[] }>(
      '/orders?status=pending&status=accepted',
    )
    expect(response.body.data).toHaveLength(2)
  })

  it('paginates with an accurate total', async () => {
    for (let i = 0; i < 5; i += 1) await placeOrder(1)

    const response = await request<{
      data: OrderSummary[]
      pagination: { total: number; hasMore: boolean }
    }>('/orders?limit=2&offset=0')

    expect(response.body.data).toHaveLength(2)
    expect(response.body.pagination.total).toBe(5)
    expect(response.body.pagination.hasMore).toBe(true)
  })

  it('returns itemCount as a number, not a bigint string', async () => {
    await placeOrder(1)
    const response = await request<{ data: OrderSummary[] }>('/orders')
    expect(typeof response.body.data[0]?.itemCount).toBe('number')
  })

  it('rejects a limit above the cap instead of accepting an unbounded query', async () => {
    const response = await request<ApiError>('/orders?limit=100000')
    expect(response.status).toBe(400)
  })

  it('searches by order number', async () => {
    const order = await placeOrder(1)
    const response = await request<{ data: OrderSummary[] }>(
      `/orders?search=${order.orderNumber}`,
    )
    expect(response.body.data).toHaveLength(1)
    expect(response.body.data[0]?.id).toBe(order.id)
  })
})

describe('GET /orders/:id', () => {
  it('rejects a malformed id before touching the database', async () => {
    const response = await request<ApiError>('/orders/not-a-uuid')
    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('returns the order with its lines', async () => {
    const created = await placeOrder(2)
    const response = await request<OrderDetail>(`/orders/${created.id}`)

    expect(response.status).toBe(200)
    expect(response.body.items).toHaveLength(1)
    expect(response.body.items[0]?.quantity).toBe(2)
    expect(response.body.items[0]?.nameSnapshot).toBe('Available dish')
    expect(response.body.customer.id).toBe(fx.customerId)
  })
})

/**
 * Regressions from the independent review pass.
 */
describe('review regressions', () => {
  it('answers a malformed JSON body with 400, not 500', async () => {
    const response = await request<ApiError>('/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"customer": {',
    })

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('answers an empty JSON body with 400, not 500', async () => {
    const response = await request<ApiError>('/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '',
    })

    expect(response.status).toBe(400)
  })

  /**
   * `%` and `_` are LIKE wildcards. Unescaped, searching for a literal `%` matched every
   * row — the operator sees "all orders" and reasonably reports it as a bug.
   */
  it('treats % and _ in a search term as literal characters', async () => {
    await placeOrder(1)

    const wildcard = await request<{ data: OrderSummary[] }>('/orders?search=%25')
    expect(wildcard.status).toBe(200)
    // No order number or customer in the fixture contains a literal '%'.
    expect(wildcard.body.data).toHaveLength(0)

    const underscore = await request<{ data: OrderSummary[] }>('/orders?search=_')
    expect(underscore.body.data).toHaveLength(0)

    // A real substring of the seeded customer name still matches.
    const real = await request<{ data: OrderSummary[] }>('/orders?search=Test')
    expect(real.body.data.length).toBeGreaterThan(0)
  })
})
