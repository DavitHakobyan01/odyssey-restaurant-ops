/**
 * Driving a status transition from the detail screen.
 *
 * `useOrderActions` owns the request, the invalidation and the toasts. What this adds is
 * the one piece of interaction the screen would otherwise carry: some transitions need a
 * reason before they may be sent, so those open a dialog instead of firing immediately.
 */
import { useState } from 'react'

import { ORDER_TRANSITIONS, type OrderAction } from '@odyssey/types/domain'

import { useOrderActions } from './useOrderActions'

export function useOrderActionFlow(orderId: string) {
  const { runAction, runningAction } = useOrderActions()

  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelError, setCancelError] = useState<string | undefined>()

  const onAction = async (action: OrderAction) => {
    // Cancelling needs a reason; the server rejects a reasonless cancel with a 400, so
    // the modal collects it rather than letting the operator hit an avoidable error.
    if (ORDER_TRANSITIONS[action].requiresReason) {
      setCancelReason('')
      setCancelError(undefined)
      setCancelOpen(true)
      return
    }
    await runAction(orderId, action)
  }

  const confirmCancel = async () => {
    if (cancelReason.trim().length === 0) {
      setCancelError('A reason is required to cancel an order.')
      return
    }
    const ok = await runAction(orderId, 'cancel', cancelReason.trim())
    if (ok) setCancelOpen(false)
  }

  return {
    runningAction,
    onAction,
    cancelOpen,
    closeCancel: () => setCancelOpen(false),
    cancelReason,
    /** Typing clears the "reason required" error rather than leaving it under a filled field. */
    changeCancelReason: (value: string) => {
      setCancelReason(value)
      if (cancelError) setCancelError(undefined)
    },
    cancelError,
    confirmCancel,
  }
}
