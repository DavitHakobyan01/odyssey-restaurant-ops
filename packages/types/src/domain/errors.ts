/**
 * The closed set of API failure modes.
 *
 * Declared here, in the dependency-free domain layer, rather than alongside the zod
 * error schema — because the *frontend* is the main consumer. The API client branches on
 * `error.code === 'ITEM_UNAVAILABLE'` to decide what to tell the operator, and it must be
 * able to do that without pulling zod (and through it, drizzle) into the app bundle.
 *
 * `contracts/common.ts` builds the zod enum from this same tuple, so the runtime
 * validation, the OpenAPI document and the client's error handling cannot drift apart.
 */

export const API_ERROR_CODES = [
  /** The request failed schema validation. 400. */
  'VALIDATION_ERROR',
  /** The addressed resource does not exist. 404. */
  'NOT_FOUND',
  /** Valid request, conflicts with current state (duplicate name, concurrent edit). 409. */
  'CONFLICT',
  /** The requested lifecycle action is not legal from the order's current status. 409. */
  'INVALID_TRANSITION',
  /** One or more requested menu items are not currently available. 422. */
  'ITEM_UNAVAILABLE',
  /** Ordering is switched off in settings. 422. */
  'ORDERS_DISABLED',
  /** The order subtotal is below the configured minimum. 422. */
  'BELOW_MINIMUM',
  /** The client's expected total disagreed with server-side pricing. 409. */
  'TOTAL_MISMATCH',
  /** Unexpected server failure. The message is never safe to show verbatim. 500. */
  'INTERNAL_ERROR',
] as const

export type ApiErrorCode = (typeof API_ERROR_CODES)[number]

/**
 * Codes the operator can do something about, versus codes that mean "try again later".
 * Used to decide whether to offer a retry affordance.
 */
export function isRetryable(code: ApiErrorCode): boolean {
  return code === 'INTERNAL_ERROR'
}
