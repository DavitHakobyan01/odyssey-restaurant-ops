/**
 * Shared React Query configuration.
 *
 * Defaults live here rather than in the app so every consumer (dashboard, tests, a
 * future native build) behaves identically, and so the reasoning behind each default is
 * written down once.
 */
import { QueryClient } from '@tanstack/react-query'

import { ApiClientError } from './http-client'

/**
 * Retrying a request the server has already definitively rejected is pointless and
 * makes failures feel slow. Only genuinely transient conditions are worth a second try.
 */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false

  if (error instanceof ApiClientError) {
    // 4xx means the request itself was wrong — retrying changes nothing.
    // 5xx and network-level failures may be transient.
    return error.status >= 500
  }

  // Unknown error (offline, DNS, aborted socket) — worth one retry.
  return true
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: shouldRetry,
        // Restaurant operations data changes constantly; 30s keeps navigation snappy
        // without showing meaningfully stale order state.
        staleTime: 30_000,
        // Refetching on focus is genuinely useful here: an operator switching back to
        // the tab wants the current order queue, not what it was ten minutes ago.
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
      },
      mutations: {
        // A failed write must never be silently replayed — a retried "create order"
        // could produce a duplicate order.
        retry: false,
      },
    },
  })
}
