/**
 * Create-order flow.
 *
 * All of the pricing and submission logic lives in `useCreateOrder` — including the
 * `expectedTotalCents` handshake that makes the running total safe to show. This file is
 * the dialog around it.
 */
import { ORDER_TYPES, ORDER_TYPE_LABEL } from '@odyssey/types/domain'
import {
  Alert,
  Badge,
  Button,
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
} from '@odyssey/ui'

import { useMoney } from '../../lib/useMoney'
import { useCreateOrderForm } from './useCreateOrder'

export type CreateOrderModalProps = {
  open: boolean
  onClose: () => void
  /** Called with the new order's id so the caller can navigate to it. */
  onCreated?: (orderId: string) => void
}

export function CreateOrderModal({ open, onClose, onCreated }: CreateOrderModalProps) {
  const money = useMoney()

  const {
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
    isSubmitting,
    canSubmit,
  } = useCreateOrderForm({ onClose, onCreated })

  const dismiss = () => {
    reset()
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={dismiss}
      title="New order"
      description="Totals are calculated by the server from current menu prices."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onPress={dismiss}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={isSubmitting}
            disabled={!canSubmit}
            onPress={() => void submit()}
          >
            {totals ? `Create order · ${money.format(totals.totalCents)}` : 'Create order'}
          </Button>
        </>
      }
    >
      <VStack gap={4}>
        {formError ? <Alert tone="danger" title={formError} /> : null}

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
                    {money.format(line.unitPriceCents)} each
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
                  {money.format(line.unitPriceCents * line.quantity)}
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
          {totals ? (
            <>
              <TotalRow label="Subtotal" value={money.format(totals.subtotalCents)} />
              <TotalRow label="Tax" value={money.format(totals.taxCents)} />
              <TotalRow label="Service fee" value={money.format(totals.serviceFeeCents)} />
              <TotalRow label="Total" value={money.format(totals.totalCents)} emphasis />
            </>
          ) : (
            <Text variant="bodySm" tone={settingsFailed ? 'danger' : 'muted'}>
              {settingsFailed
                ? 'Could not load pricing settings, so this order cannot be priced.'
                : 'Loading pricing settings…'}
            </Text>
          )}
          <Text variant="caption" tone="subtle">
            Calculated with the same pricing function the server uses. It is sent for
            verification — a disagreement rejects the order rather than changing the price.
          </Text>
          {belowMinimum && settings ? (
            <Badge tone="warning" variant="subtle" size="sm">
              {`Below the ${money.format(settings.minimumOrderCents)} minimum`}
            </Badge>
          ) : null}
        </VStack>
      </VStack>

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
