/**
 * State and submission for the create-order flow.
 *
 * The interesting part is the running total. It is computed with `calculateOrderTotals`
 * from `@odyssey/types/domain` — the *same* function the backend uses to price the order
 * it persists — using the tax and service rates from `GET /settings`.
 *
 * That shared function is what makes the estimate trustworthy, and sending it back as
 * `expectedTotalCents` is what makes it safe: the server recomputes independently and
 * rejects the order with `409 TOTAL_MISMATCH` if the two disagree, rather than charging a
 * total nobody agreed to. So a stale menu price surfaces as an explicit error instead of
 * a silent overcharge.
 *
 * Unavailable items are never selectable here, but that is a convenience, not the
 * enforcement — the API rejects them regardless, and that rejection is handled below.
 */
import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import {
  ApiClientError,
  useCreateOrder as useCreateOrderMutation,
  useGetSettings,
  useListCustomers,
  useListMenuItems,
} from '@odyssey/api-client'
import type { CreateOrderRequest } from '@odyssey/api-client'
import { calculateOrderTotals } from '@odyssey/types/domain'
import { useToast } from '@odyssey/ui'

import { invalidateOrderDependents } from '../../lib/cache'
import { useMoney } from '../../lib/useMoney'

export type Line = {
  menuItemId: string
  name: string
  unitPriceCents: number
  quantity: number
}

export type UseCreateOrderFormOptions = {
  /** Called after a successful create, so the modal can close itself. */
  onClose: () => void
  /** Called with the new order's id so the caller can navigate to it. */
  onCreated?: (orderId: string) => void
}

export function useCreateOrderForm({ onClose, onCreated }: UseCreateOrderFormOptions) {
  const toast = useToast()
  const money = useMoney()
  const queryClient = useQueryClient()

  // `totals === null` already covers "settings not usable yet", whether that is because
  // the query is in flight or because it failed, so only the failure flag is needed here
  // to choose the wording.
  const { data: settings, isError: settingsFailed } = useGetSettings()
  const { data: customers } = useListCustomers({ limit: 100, sortBy: 'name', sortDir: 'asc' })
  /**
   * Only available items are offered. The server enforces this too — this is convenience.
   *
   * `isAvailable` is typed `string`, not `boolean`, and that is correct: query parameters
   * are strings on the wire. The backend declares it with `z.stringbool()`, which coerces
   * "true"/"false" into a real boolean during validation, and the generated client type
   * faithfully reflects what actually travels in the URL.
   */
  const { data: menu } = useListMenuItems({ isAvailable: 'true', limit: 100 })

  const createOrder = useCreateOrderMutation()

  const [customerId, setCustomerId] = useState('')
  const [orderType, setOrderType] = useState<string>('takeaway')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<Line[]>([])
  const [formError, setFormError] = useState<string | undefined>()

  const reset = () => {
    setCustomerId('')
    setOrderType('takeaway')
    setNotes('')
    setLines([])
    setFormError(undefined)
  }

  const addItem = (menuItemId: string) => {
    const item = menu?.data.find((candidate) => candidate.id === menuItemId)
    if (!item) return

    setLines((current) => {
      const existing = current.find((line) => line.menuItemId === menuItemId)
      // The API rejects the same item twice in one payload, so quantities merge instead.
      if (existing) {
        return current.map((line) =>
          line.menuItemId === menuItemId ? { ...line, quantity: line.quantity + 1 } : line,
        )
      }
      return [
        ...current,
        {
          menuItemId,
          name: item.name,
          unitPriceCents: item.priceCents,
          quantity: 1,
        },
      ]
    })
  }

  const changeQuantity = (menuItemId: string, delta: number) => {
    setLines((current) =>
      current
        .map((line) =>
          line.menuItemId === menuItemId
            ? { ...line, quantity: Math.min(99, line.quantity + delta) }
            : line,
        )
        // Dropping to zero removes the line, which is what the stepper's minus implies.
        .filter((line) => line.quantity > 0),
    )
  }

  /**
   * The same arithmetic the server will perform — but only once the rates are known.
   *
   * Defaulting the rates to 0 while settings were loading or failed produced a total with
   * no tax on it. The operator saw an untaxed figure, it was sent as `expectedTotalCents`,
   * and the server's 409 was then reported as "the menu changed" — a wrong diagnosis of a
   * settings-fetch failure. `null` here means "not priceable yet", and submit is blocked.
   */
  const totals = useMemo(
    () =>
      settings
        ? calculateOrderTotals(lines, {
            taxRateBps: settings.taxRateBps,
            serviceFeeBps: settings.serviceFeeBps,
          })
        : null,
    [lines, settings],
  )

  const belowMinimum =
    settings !== undefined &&
    totals !== null &&
    totals.subtotalCents < settings.minimumOrderCents &&
    lines.length > 0

  const submit = async () => {
    setFormError(undefined)

    if (!customerId) {
      setFormError('Choose a customer for this order.')
      return
    }
    if (lines.length === 0) {
      setFormError('Add at least one item.')
      return
    }
    // Never submit a price computed without the real rates.
    if (!settings || !totals) {
      setFormError('Restaurant settings could not be loaded, so this order cannot be priced.')
      return
    }
    if (belowMinimum) {
      setFormError(
        `Order subtotal is below the ${money.format(settings.minimumOrderCents)} minimum.`,
      )
      return
    }

    const payload: CreateOrderRequest = {
      customer: { mode: 'existing', customerId },
      type: orderType as CreateOrderRequest['type'],
      items: lines.map((line) => ({ menuItemId: line.menuItemId, quantity: line.quantity })),
      notes: notes.trim() === '' ? null : notes.trim(),
      // Verified server-side, never trusted. A mismatch fails the request.
      expectedTotalCents: totals.totalCents,
    }

    try {
      const order = await createOrder.mutateAsync({ data: payload })
      await invalidateOrderDependents(queryClient, order.customerId)
      toast.success('Order created', `${order.orderNumber} · ${money.format(order.totalCents)}`)
      reset()
      onClose()
      onCreated?.(order.id)
    } catch (caught) {
      if (caught instanceof ApiClientError) {
        /**
         * Each of these means something specific and has a different remedy, so they get
         * different copy. A generic "something went wrong" would leave the operator with
         * no idea whether to change the order, the settings, or nothing at all.
         */
        switch (caught.code) {
          case 'ITEM_UNAVAILABLE':
            setFormError(`${caught.message} Remove it and try again.`)
            break
          case 'ORDERS_DISABLED':
            setFormError(
              'Ordering is switched off in Settings, so the kitchen is not accepting orders.',
            )
            break
          case 'BELOW_MINIMUM':
            setFormError(caught.message)
            break
          case 'TOTAL_MISMATCH':
            setFormError(
              `${caught.message} The menu changed while you were building this order.`,
            )
            break
          default:
            setFormError(caught.message)
        }
        toast.error('Could not create the order', caught.message)
      } else {
        setFormError('Could not reach the server. Check your connection.')
      }
    }
  }

  const customerOptions = (customers?.data ?? []).map((customer) => ({
    label: customer.name,
    value: customer.id,
    description: customer.email,
  }))

  const menuOptions = (menu?.data ?? []).map((item) => ({
    label: item.name,
    value: item.id,
    description: money.format(item.priceCents),
  }))

  return {
    customerId,
    setCustomerId,
    orderType,
    setOrderType,
    notes,
    setNotes,
    lines,
    addItem,
    changeQuantity,
    formError,
    settings,
    settingsFailed,
    totals,
    belowMinimum,
    customerOptions,
    menuOptions,
    submit,
    reset,
    isSubmitting: createOrder.isPending,
    // `!totals` covers settings still loading or failed: an order that cannot be priced
    // with the real rates must not be submittable at all.
    canSubmit: lines.length > 0 && Boolean(customerId) && Boolean(totals) && !belowMinimum,
  }
}
