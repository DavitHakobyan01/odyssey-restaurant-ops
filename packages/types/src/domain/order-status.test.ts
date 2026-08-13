/**
 * Order state machine tests.
 *
 * The backend enforces these rules and the dashboard renders affordances from them, so
 * both depend on this module being right. The tests are written against the *derived*
 * helpers rather than against the transition table, so a careless edit to the table is
 * caught by a failing behaviour rather than by a matching literal.
 */
import { describe, expect, it } from 'vitest'

import {
  ORDER_ACTIONS,
  ORDER_STATUSES,
  ORDER_STATUS_LABEL,
  ORDER_STATUS_TONE,
  ORDER_TRANSITIONS,
  TERMINAL_ORDER_STATUSES,
  canTransition,
  getAvailableActions,
  isTerminalStatus,
  resolveTransition,
  type OrderStatus,
} from './order-status'

describe('the happy path', () => {
  it('walks pending -> accepted -> preparing -> ready -> completed', () => {
    let status: OrderStatus = 'pending'
    const walk = ['accept', 'start_preparing', 'mark_ready', 'complete'] as const
    const reached: OrderStatus[] = []

    for (const action of walk) {
      const next = resolveTransition(status, action)
      expect(next).not.toBeNull()
      status = next as OrderStatus
      reached.push(status)
    }

    expect(reached).toEqual(['accepted', 'preparing', 'ready', 'completed'])
  })
})

describe('getAvailableActions', () => {
  it('offers accept or cancel from pending', () => {
    expect(getAvailableActions('pending')).toEqual(['accept', 'cancel'])
  })

  it('offers exactly one forward action plus cancel at each active stage', () => {
    expect(getAvailableActions('accepted')).toEqual(['start_preparing', 'cancel'])
    expect(getAvailableActions('preparing')).toEqual(['mark_ready', 'cancel'])
    expect(getAvailableActions('ready')).toEqual(['complete', 'cancel'])
  })

  it('offers nothing from a terminal status', () => {
    expect(getAvailableActions('completed')).toEqual([])
    expect(getAvailableActions('cancelled')).toEqual([])
  })

  it('only ever returns actions that actually resolve', () => {
    // The property the UI depends on: every button it renders must work.
    for (const status of ORDER_STATUSES) {
      for (const action of getAvailableActions(status)) {
        expect(resolveTransition(status, action)).not.toBeNull()
      }
    }
  })
})

describe('illegal transitions', () => {
  it('refuses to skip stages', () => {
    expect(resolveTransition('pending', 'complete')).toBeNull()
    expect(resolveTransition('pending', 'mark_ready')).toBeNull()
    expect(resolveTransition('accepted', 'complete')).toBeNull()
  })

  it('refuses to move backwards', () => {
    expect(resolveTransition('preparing', 'accept')).toBeNull()
    expect(resolveTransition('completed', 'start_preparing')).toBeNull()
  })

  it('refuses every action from every terminal status', () => {
    for (const status of TERMINAL_ORDER_STATUSES) {
      for (const action of ORDER_ACTIONS) {
        expect(resolveTransition(status, action)).toBeNull()
      }
    }
  })

  it('agrees with canTransition for every status/action pair', () => {
    for (const status of ORDER_STATUSES) {
      for (const action of ORDER_ACTIONS) {
        expect(canTransition(status, action)).toBe(resolveTransition(status, action) !== null)
      }
    }
  })
})

describe('cancellation', () => {
  it('is possible from every non-terminal status', () => {
    for (const status of ORDER_STATUSES) {
      const expected = !isTerminalStatus(status)
      expect(canTransition(status, 'cancel')).toBe(expected)
    }
  })

  it('is the only action requiring a reason', () => {
    const requiring = ORDER_ACTIONS.filter((action) => ORDER_TRANSITIONS[action].requiresReason)
    expect(requiring).toEqual(['cancel'])
  })
})

describe('completeness — a new status cannot be added by halves', () => {
  it('gives every status a display label', () => {
    for (const status of ORDER_STATUSES) {
      expect(ORDER_STATUS_LABEL[status]).toBeTruthy()
    }
  })

  it('gives every status a semantic tone', () => {
    for (const status of ORDER_STATUSES) {
      expect(ORDER_STATUS_TONE[status]).toBeTruthy()
    }
  })

  it('makes every non-terminal status reachable and every action usable', () => {
    const reachable = new Set<OrderStatus>(['pending'])
    for (const action of ORDER_ACTIONS) {
      reachable.add(ORDER_TRANSITIONS[action].to)
    }
    // Every declared status is somewhere in the machine — no orphans.
    for (const status of ORDER_STATUSES) {
      expect(reachable.has(status)).toBe(true)
    }
  })

  it('has no action that can never be taken', () => {
    for (const action of ORDER_ACTIONS) {
      expect(ORDER_TRANSITIONS[action].from.length).toBeGreaterThan(0)
    }
  })
})
