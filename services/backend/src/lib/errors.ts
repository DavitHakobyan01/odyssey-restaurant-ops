/**
 * Domain errors and their HTTP representation.
 *
 * Services throw `AppError` with a domain code and never touch HTTP concerns; the app's
 * `onError` hook is the single place that turns one into a response. That keeps business
 * logic testable without a request object, and guarantees every failure — validation,
 * domain rule, or unexpected crash — leaves the API in the same `{ error: { code, message } }`
 * envelope that `apiErrorSchema` documents.
 *
 * Status code convention
 * ----------------------
 * 400 the request itself is malformed (failed schema validation)
 * 404 the addressed resource does not exist
 * 409 the request is valid but conflicts with current state (illegal transition, duplicate)
 * 422 the request is well-formed and unambiguous but violates a business rule
 *     (item unavailable, below minimum order, ordering switched off)
 * 500 unexpected — the only case where the message is not safe to show a user
 */
import type { ApiError, ApiErrorCode } from '@odyssey/types'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

export type ApiErrorDetail = { path: string; message: string }

const STATUS_BY_CODE: Record<ApiErrorCode, ContentfulStatusCode> = {
  VALIDATION_ERROR: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INVALID_TRANSITION: 409,
  TOTAL_MISMATCH: 409,
  ITEM_UNAVAILABLE: 422,
  ORDERS_DISABLED: 422,
  BELOW_MINIMUM: 422,
  INTERNAL_ERROR: 500,
}

export class AppError extends Error {
  readonly code: ApiErrorCode
  readonly status: ContentfulStatusCode
  readonly details: ApiErrorDetail[] | undefined

  constructor(code: ApiErrorCode, message: string, details?: ApiErrorDetail[]) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.status = STATUS_BY_CODE[code]
    this.details = details
  }

  toBody(): ApiError {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details ? { details: this.details } : {}),
      },
    }
  }
}

/* -------------------------------------------------------------------------- */
/*                       Constructors for the common cases                     */
/* -------------------------------------------------------------------------- */

export const notFound = (resource: string, id?: string) =>
  new AppError('NOT_FOUND', id ? `${resource} '${id}' was not found` : `${resource} was not found`)

export const conflict = (message: string, details?: ApiErrorDetail[]) =>
  new AppError('CONFLICT', message, details)

export const validationFailed = (message: string, details?: ApiErrorDetail[]) =>
  new AppError('VALIDATION_ERROR', message, details)

/**
 * An order was asked to move somewhere the state machine does not allow.
 * The message names the current status and the attempted action so the operator
 * understands *why* — usually it means someone else already advanced the order.
 */
export const invalidTransition = (currentStatus: string, action: string, allowed: string[]) =>
  new AppError(
    'INVALID_TRANSITION',
    allowed.length > 0
      ? `Cannot '${action}' an order that is '${currentStatus}'. Available actions: ${allowed.join(', ')}.`
      : `Cannot '${action}' an order that is '${currentStatus}'. This order is closed and cannot change further.`,
    [{ path: 'action', message: `not permitted from status '${currentStatus}'` }],
  )

export const itemUnavailable = (names: string[]) =>
  new AppError(
    'ITEM_UNAVAILABLE',
    names.length === 1
      ? `'${names[0]}' is not currently available.`
      : `These items are not currently available: ${names.join(', ')}.`,
    names.map((name) => ({ path: 'items', message: `'${name}' is unavailable` })),
  )

export const ordersDisabled = () =>
  new AppError(
    'ORDERS_DISABLED',
    'The restaurant is not accepting orders right now. Re-enable ordering in Settings.',
  )

export const belowMinimum = (subtotalCents: number, minimumCents: number) =>
  new AppError(
    'BELOW_MINIMUM',
    `Order subtotal is below the ${formatCents(minimumCents)} minimum (got ${formatCents(subtotalCents)}).`,
    [{ path: 'items', message: `minimum order is ${formatCents(minimumCents)}` }],
  )

/**
 * The client's arithmetic disagreed with the server's. Almost always a stale menu
 * price on the client — surfaced loudly rather than silently charging a different total.
 */
export const totalMismatch = (expectedCents: number, actualCents: number) =>
  new AppError(
    'TOTAL_MISMATCH',
    `Order total has changed: you expected ${formatCents(expectedCents)} but current pricing gives ${formatCents(actualCents)}. Refresh the menu and try again.`,
    [{ path: 'expectedTotalCents', message: `server computed ${actualCents}` }],
  )

/** Minimal formatter for error copy; the UI has a locale-aware one in @odyssey/shared. */
function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}
