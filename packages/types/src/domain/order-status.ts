/**
 * The order lifecycle, declared exactly once.
 *
 * This module is deliberately dependency-free (no drizzle, no zod) so it is safe to
 * import from the React Native / web bundle. `db/schema.ts` builds its `pgEnum` from
 * these same tuples, so the Postgres enum, the TypeScript union, the generated zod
 * contracts and the UI all trace back to this one declaration.
 *
 * The backend is the only authority on transitions. The frontend imports
 * `getAvailableActions` purely to decide which buttons to *render* — the server
 * re-validates every transition and rejects anything invalid with a 409.
 */

export const ORDER_STATUSES = [
  'pending',
  'accepted',
  'preparing',
  'ready',
  'completed',
  'cancelled',
] as const

export type OrderStatus = (typeof ORDER_STATUSES)[number]

export const ORDER_TYPES = ['dine_in', 'takeaway', 'delivery'] as const

export type OrderType = (typeof ORDER_TYPES)[number]

/**
 * Transitions are modelled as named *actions*, not as a settable `status` field.
 * A client asks to "accept" an order; it cannot simply assert that an order is now
 * `completed`. This is what keeps the lifecycle enforceable server-side.
 */
export const ORDER_ACTIONS = [
  'accept',
  'start_preparing',
  'mark_ready',
  'complete',
  'cancel',
] as const

export type OrderAction = (typeof ORDER_ACTIONS)[number]

type TransitionRule = {
  /** Statuses from which this action is legal. */
  readonly from: readonly OrderStatus[]
  /** Status the order lands in once the action succeeds. */
  readonly to: OrderStatus
  /** Human label used for buttons and audit copy. */
  readonly label: string
  /** Whether the action requires an operator-supplied reason. */
  readonly requiresReason: boolean
}

export const ORDER_TRANSITIONS: Readonly<Record<OrderAction, TransitionRule>> = {
  accept: {
    from: ['pending'],
    to: 'accepted',
    label: 'Accept order',
    requiresReason: false,
  },
  start_preparing: {
    from: ['accepted'],
    to: 'preparing',
    label: 'Start preparing',
    requiresReason: false,
  },
  mark_ready: {
    from: ['preparing'],
    to: 'ready',
    label: 'Mark ready',
    requiresReason: false,
  },
  complete: {
    from: ['ready'],
    to: 'completed',
    label: 'Complete order',
    requiresReason: false,
  },
  cancel: {
    // Cancellable at any point before the order is handed over or already closed.
    from: ['pending', 'accepted', 'preparing', 'ready'],
    to: 'cancelled',
    label: 'Cancel order',
    requiresReason: true,
  },
}

/** Statuses from which no further transition is possible. */
export const TERMINAL_ORDER_STATUSES: readonly OrderStatus[] = ['completed', 'cancelled']

export function isTerminalStatus(status: OrderStatus): boolean {
  return TERMINAL_ORDER_STATUSES.includes(status)
}

/** Every action legal from the given status, in display order. */
export function getAvailableActions(status: OrderStatus): OrderAction[] {
  return ORDER_ACTIONS.filter((action) => ORDER_TRANSITIONS[action].from.includes(status))
}

export function canTransition(status: OrderStatus, action: OrderAction): boolean {
  return ORDER_TRANSITIONS[action].from.includes(status)
}

/**
 * Resolve the status an action leads to, or `null` when the action is illegal from
 * the current status. Callers must treat `null` as a rejection, never as a no-op.
 */
export function resolveTransition(status: OrderStatus, action: OrderAction): OrderStatus | null {
  return canTransition(status, action) ? ORDER_TRANSITIONS[action].to : null
}

/** Column on `orders` stamped when an order enters the given status. */
export const ORDER_STATUS_TIMESTAMP_COLUMN = {
  pending: 'placedAt',
  accepted: 'acceptedAt',
  preparing: 'preparingAt',
  ready: 'readyAt',
  completed: 'completedAt',
  cancelled: 'cancelledAt',
} as const satisfies Record<OrderStatus, string>

/* -------------------------------------------------------------------------- */
/*                             Presentation helpers                            */
/* -------------------------------------------------------------------------- */

/**
 * Semantic tone per status, consumed by the design system's Badge component.
 * Kept next to the statuses so a new status cannot be added without choosing a tone.
 */
export const ORDER_STATUS_TONE = {
  pending: 'warning',
  accepted: 'info',
  preparing: 'info',
  ready: 'success',
  completed: 'neutral',
  cancelled: 'danger',
} as const satisfies Record<OrderStatus, 'neutral' | 'info' | 'success' | 'warning' | 'danger'>

export const ORDER_STATUS_LABEL = {
  pending: 'Pending',
  accepted: 'Accepted',
  preparing: 'Preparing',
  ready: 'Ready',
  completed: 'Completed',
  cancelled: 'Cancelled',
} as const satisfies Record<OrderStatus, string>

export const ORDER_TYPE_LABEL = {
  dine_in: 'Dine in',
  takeaway: 'Takeaway',
  delivery: 'Delivery',
} as const satisfies Record<OrderType, string>
