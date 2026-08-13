/**
 * Order lifecycle actions.
 *
 * All the behaviour that surrounds a status transition — optimistic feedback, cache
 * invalidation, and turning domain error codes into messages an operator can act on —
 * lives here rather than in the screens, so the Orders list and the Orders detail page
 * behave identically when they trigger the same action.
 */
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'

import { ApiClientError, getGetOrderQueryKey, useTransitionOrder } from '@odyssey/api-client'
import { ORDER_STATUS_LABEL, ORDER_TRANSITIONS, type OrderAction } from '@odyssey/types/domain'
import { useToast } from '@odyssey/ui'

import { invalidateOrderDependents } from '../../lib/cache'

/**
 * Map a failed transition onto a message worth reading.
 *
 * The generic "something went wrong" is actively unhelpful here: the two realistic
 * failures mean different things and have different remedies. A 409 almost always means
 * a colleague advanced the order first, which the operator needs to know before they try
 * again.
 */
function describeTransitionFailure(error: unknown): string {
  if (error instanceof ApiClientError) {
    switch (error.code) {
      case 'INVALID_TRANSITION':
      case 'CONFLICT':
        // The server's message already names the current status and the legal actions.
        return error.message
      case 'NOT_FOUND':
        return 'That order no longer exists. It may have been removed.'
      case 'VALIDATION_ERROR':
        return error.message
      default:
        return error.message
    }
  }
  return 'Could not reach the server. Check your connection and try again.'
}

export function useOrderActions() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const { mutateAsync, isPending } = useTransitionOrder()

  /** Tracks which specific action is running, so only that button shows a spinner. */
  const [runningAction, setRunningAction] = useState<OrderAction | null>(null)

  const runAction = useCallback(
    async (orderId: string, action: OrderAction, reason?: string): Promise<boolean> => {
      setRunningAction(action)
      try {
        const updated = await mutateAsync({ id: orderId, data: { action, reason } })

        /**
         * A transition changes more than the order. The list is status-filtered, so an
         * accepted order must leave a "pending" view; and the KPIs and CRM aggregates are
         * derived from the same rows — cancelling in particular removes money from
         * revenue and from the customer's lifetime spend. See lib/cache.ts.
         */
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: getGetOrderQueryKey(orderId) }),
          invalidateOrderDependents(queryClient, updated.customerId),
        ])

        toast.success(
          `${ORDER_TRANSITIONS[action].label} — done`,
          `${updated.orderNumber} is now ${ORDER_STATUS_LABEL[updated.status].toLowerCase()}.`,
        )
        return true
      } catch (error) {
        toast.error('Could not update the order', describeTransitionFailure(error))

        // A rejected transition means our view of the order is stale. Refetch so the
        // buttons on screen match what the server will actually accept.
        await queryClient.invalidateQueries({ queryKey: getGetOrderQueryKey(orderId) })
        return false
      } finally {
        setRunningAction(null)
      }
    },
    [mutateAsync, queryClient, toast],
  )

  return { runAction, isPending, runningAction }
}
