/**
 * Create-order flow.
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
  getListOrdersQueryKey,
  useCreateOrder,
  useGetSettings,
  useListCustomers,
  useListMenuItems,
} from '@odyssey/api-client'
import type { CreateOrderRequest } from '@odyssey/api-client'
import { formatMoney } from '@odyssey/shared'
import { ORDER_TYPES, ORDER_TYPE_LABEL, calculateOrderTotals } from '@odyssey/types/domain'
import {
  Badge,
  Button,
  DialogBody,
  DialogFooter,
  Divider,
  EmptyState,
  Field,
  HStack,
  Modal,
  Select,
  Spacer,
  Text,
  Textarea,
  VStack,
  useTheme,
  useToast,
} from '@odyssey/ui'

type Line = { menuItemId: string; name: string; unitPriceCents: number; quantity: number }

export type CreateOrderModalProps = {
  open: boolean
  onClose: () => void
  /** Called with the new order's id so the caller can navigate to it. */
  onCreated?: (orderId: string) => void
}

export function CreateOrderModal({ open, onClose, onCreated }: CreateOrderModalProps) {
  const theme = useTheme()
  const toast = useToast()
  const queryClient = useQueryClient()

  const { data: settings } = useGetSettings()
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

  const createOrder = useCreateOrder()

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

  /** The same arithmetic the server will perform. */
  const totals = useMemo(
    () =>
      calculateOrderTotals(lines, {
        taxRateBps: settings?.taxRateBps ?? 0,
        serviceFeeBps: settings?.serviceFeeBps ?? 0,
      }),
    [lines, settings],
  )

  const belowMinimum =
    settings !== undefined && totals.subtotalCents < settings.minimumOrderCents && lines.length > 0

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
      await queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() })
      toast.success('Order created', `${order.orderNumber} · ${formatMoney(order.totalCents)}`)
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
    description: formatMoney(item.priceCents),
  }))

  return (
    <Modal
      open={open}
      onClose={() => {
        reset()
        onClose()
      }}
      title="New order"
      description="Totals are calculated by the server from current menu prices."
      size="lg"
    >
      <DialogBody>
        <VStack gap={4}>
          {formError ? (
            <VStack
              style={{
                backgroundColor: theme.color.dangerSubtle,
                borderRadius: theme.radius.lg,
                borderWidth: theme.borderWidth.hairline,
                borderColor: theme.color.dangerBorder,
                padding: theme.spacing[3],
              }}
            >
              <Text variant="bodySm" tone="danger">
                {formError}
              </Text>
            </VStack>
          ) : null}

          <Field label="Customer" required>
            <Select
              value={customerId}
              onChange={setCustomerId}
              options={customerOptions}
              placeholder="Choose a customer"
              invalid={Boolean(formError) && !customerId}
            />
          </Field>

          <Field label="Order type">
            <Select
              value={orderType}
              onChange={setOrderType}
              options={ORDER_TYPES.map((value) => ({
                label: ORDER_TYPE_LABEL[value],
                value,
              }))}
            />
          </Field>

          <Field label="Add items" helperText="Only items the kitchen can currently make are listed.">
            <Select value="" onChange={addItem} options={menuOptions} placeholder="Add an item…" />
          </Field>

          {lines.length === 0 ? (
            <EmptyState size="sm" title="No items yet" description="Add at least one item to the order." />
          ) : (
            <VStack gap={2}>
              {lines.map((line) => (
                <HStack key={line.menuItemId} gap={3} align="center">
                  <VStack gap={0} style={{ flex: 1, minWidth: 0 }}>
                    <Text variant="bodySm" weight="500" numberOfLines={1}>
                      {line.name}
                    </Text>
                    <Text variant="caption" tone="subtle">
                      {formatMoney(line.unitPriceCents)} each
                    </Text>
                  </VStack>

                  <HStack gap={2} align="center">
                    <Button
                      variant="secondary"
                      size="sm"
                      onPress={() => changeQuantity(line.menuItemId, -1)}
                      accessibilityLabel={`Remove one ${line.name}`}
                    >
                      –
                    </Button>
                    <Text variant="bodySm" numeric style={{ minWidth: 24, textAlign: 'center' }}>
                      {line.quantity}
                    </Text>
                    <Button
                      variant="secondary"
                      size="sm"
                      onPress={() => changeQuantity(line.menuItemId, 1)}
                      accessibilityLabel={`Add one ${line.name}`}
                    >
                      +
                    </Button>
                  </HStack>

                  <Text variant="bodySm" numeric weight="600" style={{ minWidth: 72, textAlign: 'right' }}>
                    {formatMoney(line.unitPriceCents * line.quantity)}
                  </Text>
                </HStack>
              ))}
            </VStack>
          )}

          <Field label="Notes">
            <Textarea
              value={notes}
              onChangeText={setNotes}
              placeholder="Allergies, table number, delivery instructions"
            />
          </Field>

          <Divider />

          <VStack gap={2}>
            <TotalRow label="Subtotal" value={formatMoney(totals.subtotalCents)} />
            <TotalRow label="Tax" value={formatMoney(totals.taxCents)} />
            <TotalRow label="Service fee" value={formatMoney(totals.serviceFeeCents)} />
            <TotalRow label="Total" value={formatMoney(totals.totalCents)} emphasis />
            <Text variant="caption" tone="subtle">
              Calculated with the same pricing function the server uses. It is sent for
              verification — a disagreement rejects the order rather than changing the price.
            </Text>
            {belowMinimum && settings ? (
              <Badge tone="warning" variant="subtle" size="sm">
                {`Below the ${formatMoney(settings.minimumOrderCents)} minimum`}
              </Badge>
            ) : null}
          </VStack>
        </VStack>
      </DialogBody>

      <DialogFooter>
        <Button
          variant="secondary"
          onPress={() => {
            reset()
            onClose()
          }}
        >
          Cancel
        </Button>
        <Button
          variant="primary"
          loading={createOrder.isPending}
          disabled={lines.length === 0 || !customerId}
          onPress={() => void submit()}
        >
          {`Create order · ${formatMoney(totals.totalCents)}`}
        </Button>
      </DialogFooter>
    </Modal>
  )
}

function TotalRow({
  label,
  value,
  emphasis = false,
}: {
  label: string
  value: string
  emphasis?: boolean
}) {
  return (
    <HStack align="center">
      <Text variant="bodySm" tone={emphasis ? 'default' : 'muted'} weight={emphasis ? '600' : '400'}>
        {label}
      </Text>
      <Spacer />
      <Text variant={emphasis ? 'heading' : 'bodySm'} numeric weight={emphasis ? '600' : '500'}>
        {value}
      </Text>
    </HStack>
  )
}
