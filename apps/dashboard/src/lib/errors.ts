/**
 * Turning a caught value into something worth showing an operator.
 *
 * This existed as a copy-pasted `caught instanceof ApiClientError ? caught.message :
 * 'Please try again.'` at six call sites across Menu, CRM, Settings and Orders. The
 * duplication was not merely untidy — it had already drifted: the Orders screen described
 * a network failure as "Could not reach the server", while the other three said "Please
 * try again." for the identical event.
 */
import { ApiClientError } from '@odyssey/api-client'

/**
 * A message the operator can act on.
 *
 * The backend's `message` is already written for a human and names the specific problem
 * ("'Whole bream' is not currently available."), so it is preferred verbatim. Anything
 * that is not an `ApiClientError` never reached the server — a DNS failure, an offline
 * device, an aborted socket — and "try again" is genuinely the right advice there,
 * whereas it is misleading for a 422 that will fail identically next time.
 */
export function describeError(caught: unknown, fallback = 'Please try again.'): string {
  if (caught instanceof ApiClientError) return caught.message
  if (caught instanceof TypeError) {
    // fetch() rejects with a TypeError when the request never left the device.
    return 'Could not reach the server. Check your connection and try again.'
  }
  return fallback
}

/** Field-level messages from a failed request, keyed by path. Empty for non-API errors. */
export function fieldErrorsOf(caught: unknown): Record<string, string> {
  return caught instanceof ApiClientError ? caught.fieldErrors : {}
}
