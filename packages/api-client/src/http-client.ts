/**
 * The single network boundary for the entire dashboard.
 *
 * Orval generates hooks that call this mutator; nothing in the app calls `fetch`
 * directly. Concentrating transport here means base URL resolution, JSON handling,
 * error normalisation and abort-signal plumbing are each implemented once, and any
 * cross-cutting concern added later (auth headers, tracing, retry policy) has exactly
 * one place to live.
 */

import type { ApiErrorCode } from '@odyssey/types/domain'

/**
 * Resolved at bundle time by Expo. `EXPO_PUBLIC_` is required — without the prefix
 * Expo strips the variable from the client bundle and this silently becomes undefined.
 */
const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8787'

export type ApiErrorDetail = { path: string; message: string }

/**
 * A typed transport error.
 *
 * The `code` comes from the backend's closed error enum, so UI can branch on
 * `error.code === 'ITEM_UNAVAILABLE'` rather than pattern-matching message text.
 */
export class ApiClientError extends Error {
  readonly status: number
  readonly code: ApiErrorCode
  readonly details: ApiErrorDetail[]

  constructor(status: number, code: ApiErrorCode, message: string, details: ApiErrorDetail[] = []) {
    super(message)
    this.name = 'ApiClientError'
    this.status = status
    this.code = code
    this.details = details
  }

  /** Field-level messages keyed by path, for binding to form inputs. */
  get fieldErrors(): Record<string, string> {
    return Object.fromEntries(this.details.map((detail) => [detail.path, detail.message]))
  }
}

function joinUrl(base: string, path: string): string {
  if (/^https?:\/\//i.test(path)) return path
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
}

/**
 * Orval's fetch mutator.
 *
 * Returns parsed JSON on success and throws `ApiClientError` on failure, which is what
 * React Query expects: a rejected promise puts the query into its error state, so every
 * generated hook gets consistent error handling for free.
 */
export const customFetch = async <T>(url: string, init: RequestInit = {}): Promise<T> => {
  const response = await fetch(joinUrl(BASE_URL, url), {
    ...init,
    headers: {
      // Only set Content-Type when there is a body; sending it on a GET makes some
      // proxies treat the request as non-simple and trigger a needless preflight.
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  })

  // 204 No Content — DELETE and similar. There is no body to parse.
  if (response.status === 204) {
    return undefined as T
  }

  const rawBody = await response.text()
  const parsedBody: unknown = rawBody ? safeJsonParse(rawBody) : undefined

  if (!response.ok) {
    throw toApiClientError(response.status, parsedBody)
  }

  return parsedBody as T
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    // A non-JSON body from a proxy or gateway. Preserve it as text for the error path.
    return value
  }
}

/**
 * Normalise anything the network produced into `ApiClientError`.
 *
 * The backend always answers with `{ error: { code, message, details } }`, but a failure
 * can also come from a load balancer or a crashed process that knows nothing about that
 * envelope — so the shape is checked rather than assumed.
 */
function toApiClientError(status: number, body: unknown): ApiClientError {
  if (
    typeof body === 'object' &&
    body !== null &&
    'error' in body &&
    typeof (body as { error: unknown }).error === 'object' &&
    (body as { error: unknown }).error !== null
  ) {
    const error = (body as { error: { code?: string; message?: string; details?: unknown } }).error
    return new ApiClientError(
      status,
      (error.code as ApiErrorCode) ?? 'INTERNAL_ERROR',
      error.message ?? 'Request failed.',
      Array.isArray(error.details) ? (error.details as ApiErrorDetail[]) : [],
    )
  }

  return new ApiClientError(
    status,
    'INTERNAL_ERROR',
    typeof body === 'string' && body.length > 0
      ? body
      : `Request failed with status ${status}.`,
  )
}
