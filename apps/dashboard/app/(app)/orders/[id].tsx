/**
 * Order detail.
 *
 * The most important line in this file is the action row: it renders one button per entry
 * in `order.availableActions`, which the **server** computed from the persisted status
 * using the same state machine the transition endpoint enforces.
 *
 * That is the whole point of the design. The UI never decides what is legal — it asks.
 * So an operator can never be shown a button the server would reject, and adding a new
 * status to the state machine changes this screen without touching it.
 */
import { useLocalSearchParams, useRouter } from 'expo-router'

import { useGetOrder } from '@odyssey/api-client'
import { formatDateTime, formatRelativeTime } from '@odyssey/shared'
import {
  ORDER_STATUS_LABEL,
  ORDER_STATUS_TONE,
  ORDER_TRANSITIONS,
  ORDER_TYPE_LABEL,
} from '@odyssey/types/domain'
import {
  Badge,
  Button,
  Card,
  Divider,
  ErrorState,
  Field,
  HStack,
  Modal,
  PageHeader,
  Skeleton,
  Spacer,
  StatusDot,
  Table,
  Text,
  Textarea,
  VStack,
  useBreakpoint,
  useTheme,
} from '@odyssey/ui'

import { useOrderActionFlow } from '../../../src/features/orders/useOrderActionFlow'
import { useMoney } from '../../../src/lib/useMoney'

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const theme = useTheme()
  const money = useMoney()
  const isPhone = useBreakpoint() === 'sm'

  const { data: order, isPending, isError, error, refetch } = useGetOrder(id)
  const {
    runningAction,
    onAction,
    cancelOpen,
    closeCancel,
    cancelReason,
    changeCancelReason,
    cancelError,
    confirmCancel,
  } = useOrderActionFlow(id)

  if (isError) {
    return (
      <VStack gap={6}>
        <PageHeader title="Order" breadcrumbs={[{ label: 'Orders', onPress: () => router.push('/orders') }]} />
        <ErrorState
          title="Could not load this order"
          error={error}
          onRetry={() => void refetch()}
        />
      </VStack>
    )
  }

  if (isPending) {
    return (
      <VStack gap={6}>
        <PageHeader title="Order" />
        <Skeleton width={240} height={28} />
        <Card padding={5}>
          <VStack gap={3}>
            <Skeleton width="60%" height={16} />
            <Skeleton width="40%" height={16} />
            <Skeleton width="100%" height={120} />
          </VStack>
        </Card>
      </VStack>
    )
  }

  const timeline = [
    { label: 'Placed', at: order.placedAt },
    { label: 'Accepted', at: order.acceptedAt },
    { label: 'Preparing', at: order.preparingAt },
    { label: 'Ready', at: order.readyAt },
    { label: 'Completed', at: order.completedAt },
    { label: 'Cancelled', at: order.cancelledAt },
    // Only stages the order actually reached — an audit trail must not imply otherwise.
  ].filter((entry): entry is { label: string; at: string } => Boolean(entry.at))

  return (
    <VStack gap={5}>
      <PageHeader
        title={order.orderNumber}
        breadcrumbs={[
          { label: 'Orders', onPress: () => router.push('/orders') },
          { label: order.orderNumber },
        ]}
        description={`${ORDER_TYPE_LABEL[order.type]} · placed ${formatRelativeTime(order.placedAt)}`}
        actions={
          <Badge tone={ORDER_STATUS_TONE[order.status]} variant="subtle">
            {ORDER_STATUS_LABEL[order.status]}
          </Badge>
        }
      />

      {/*
        Rendered from the server's own list of legal actions. If this array is empty the
        order is in a terminal state and no buttons appear at all.
      */}
      {order.availableActions.length > 0 ? (
        <Card padding={4}>
          <HStack gap={3} wrap align="center">
            <Text variant="bodySm" tone="muted">
              Available actions
            </Text>
            <Spacer />
            {order.availableActions.map((action) => (
              <Button
                key={action}
                variant={action === 'cancel' ? 'dangerSubtle' : 'primary'}
                loading={runningAction === action}
                disabled={runningAction !== null && runningAction !== action}
                onPress={() => void onAction(action)}
                testID={`order-action-${action}`}
              >
                {ORDER_TRANSITIONS[action].label}
              </Button>
            ))}
          </HStack>
        </Card>
      ) : (
        <Card padding={4}>
          <Text variant="bodySm" tone="muted">
            This order is {ORDER_STATUS_LABEL[order.status].toLowerCase()} and can no longer change.
          </Text>
        </Card>
      )}

      {order.cancellationReason ? (
        <Card padding={4}>
          <VStack gap={1}>
            <Text variant="caption" tone="danger" weight="600">
              Cancellation reason
            </Text>
            <Text variant="bodySm">{order.cancellationReason}</Text>
          </VStack>
        </Card>
      ) : null}

      <HStack gap={5} wrap align="flex-start">
        {/*
          `minWidth` is dropped at phone width. A flex item whose min-width exceeds its
          container overflows it, and 320 is wider than the content area on a 320pt-class
          phone or in split-screen — which would force the whole page to scroll sideways.
        */}
        <VStack gap={5} style={{ flex: 2, minWidth: isPhone ? 0 : 320 }}>
          <Card padding={0} header={<Text variant="heading">Items</Text>}>
            <Table
              data={order.items}
              keyExtractor={(row) => row.id}
              accessibilityLabel="Order items"
              columns={[
                {
                  key: 'nameSnapshot',
                  header: 'Item',
                  render: (row) => (
                    <VStack gap={0}>
                      <Text variant="bodySm" weight="500">
                        {row.nameSnapshot}
                      </Text>
                      {row.notes ? (
                        <Text variant="caption" tone="subtle">
                          {row.notes}
                        </Text>
                      ) : null}
                    </VStack>
                  ),
                },
                {
                  key: 'quantity',
                  header: 'Qty',
                  align: 'right',
                  render: (row) => (
                    <Text variant="bodySm" numeric>
                      {row.quantity}
                    </Text>
                  ),
                },
                {
                  key: 'unitPriceCents',
                  header: 'Unit',
                  align: 'right',
                  render: (row) => (
                    <Text variant="bodySm" numeric tone="muted">
                      {money.format(row.unitPriceCents)}
                    </Text>
                  ),
                },
                {
                  key: 'lineTotalCents',
                  header: 'Total',
                  align: 'right',
                  render: (row) => (
                    <Text variant="bodySm" numeric weight="500">
                      {money.format(row.lineTotalCents)}
                    </Text>
                  ),
                },
              ]}
            />
          </Card>

          {order.notes ? (
            <Card padding={4} header={<Text variant="heading">Order notes</Text>}>
              <Text variant="bodySm">{order.notes}</Text>
            </Card>
          ) : null}
        </VStack>

        <VStack gap={5} style={{ flex: 1, minWidth: isPhone ? 0 : 280 }}>
          <Card padding={4} header={<Text variant="heading">Customer</Text>}>
            <VStack gap={1}>
              <Text variant="bodyMedium">{order.customer.name}</Text>
              <Text variant="bodySm" tone="muted">
                {order.customer.email}
              </Text>
              <Button
                variant="ghost"
                size="sm"
                onPress={() => router.push(`/crm/${order.customer.id}`)}
                style={{ marginTop: theme.spacing[2] }}
              >
                View in CRM
              </Button>
            </VStack>
          </Card>

          {/*
            Totals are displayed exactly as the server computed and stored them. The
            client never recomputes an order's price — a rounding difference between the
            two would show the operator a number the customer was not charged.
          */}
          <Card padding={4} header={<Text variant="heading">Totals</Text>}>
            <VStack gap={2}>
              <SummaryRow label="Subtotal" value={money.format(order.subtotalCents)} />
              <SummaryRow label="Tax" value={money.format(order.taxCents)} />
              <SummaryRow label="Service fee" value={money.format(order.serviceFeeCents)} />
              <Divider style={{ marginVertical: theme.spacing[1] }} />
              <SummaryRow label="Total" value={money.format(order.totalCents)} emphasis />
            </VStack>
          </Card>

          <Card padding={4} header={<Text variant="heading">Timeline</Text>}>
            <VStack gap={3}>
              {timeline.map((entry) => (
                <HStack key={entry.label} gap={3} align="center">
                  {/* The exported primitive, not a hand-drawn View — a spacing retune
                      must move this dot with every other one in the product. */}
                  <StatusDot tone="primary" />
                  <Text variant="bodySm" weight="500">
                    {entry.label}
                  </Text>
                  <Spacer />
                  <Text variant="caption" tone="subtle">
                    {formatDateTime(entry.at)}
                  </Text>
                </HStack>
              ))}
            </VStack>
          </Card>
        </VStack>
      </HStack>

      <Modal
        open={cancelOpen}
        onClose={closeCancel}
        title="Cancel this order?"
        description="Cancelling is final — a cancelled order cannot be reopened."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onPress={closeCancel}>
              Keep order
            </Button>
            <Button
              variant="danger"
              loading={runningAction === 'cancel'}
              onPress={() => void confirmCancel()}
            >
              Cancel order
            </Button>
          </>
        }
      >
        <Field
          label="Reason"
          required
          error={cancelError}
          helperText="Recorded against the order for reporting."
        >
          <Textarea
            value={cancelReason}
            onChangeText={changeCancelReason}
            placeholder="e.g. Customer called to cancel"
            invalid={Boolean(cancelError)}
          />
        </Field>
      </Modal>
    </VStack>
  )
}

function SummaryRow({
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
      <Text variant={emphasis ? 'bodyMedium' : 'bodySm'} tone={emphasis ? 'default' : 'muted'}>
        {label}
      </Text>
      <Spacer />
      <Text variant={emphasis ? 'heading' : 'bodySm'} numeric weight={emphasis ? '600' : '500'}>
        {value}
      </Text>
    </HStack>
  )
}
