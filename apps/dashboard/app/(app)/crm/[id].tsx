/**
 * Customer detail — profile, lifetime aggregates and recent orders.
 *
 * The recent-orders list reuses `useListOrders({ customerId })` rather than introducing a
 * nested `/customers/{id}/orders` endpoint. The filter already exists on the orders
 * endpoint, so a second route would be a second thing to keep correct for no gain.
 */
import { useLocalSearchParams, useRouter } from 'expo-router'

import { useGetCustomer, useListOrders } from '@odyssey/api-client'
import { formatDate, formatMoney, formatRelativeTime } from '@odyssey/shared'
import { ORDER_STATUS_LABEL, ORDER_STATUS_TONE } from '@odyssey/types/domain'
import {
  Avatar,
  Badge,
  Card,
  EmptyState,
  ErrorState,
  HStack,
  MonoText,
  PageHeader,
  Skeleton,
  Table,
  Text,
  VStack,
  useTheme,
} from '@odyssey/ui'

export default function CustomerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const theme = useTheme()

  const { data: customer, isPending, isError, error, refetch } = useGetCustomer(id)

  const { data: orders, isPending: ordersPending } = useListOrders({
    customerId: id,
    limit: 10,
    sortBy: 'placedAt',
    sortDir: 'desc',
  })

  if (isError) {
    return (
      <VStack gap={6}>
        <PageHeader
          title="Customer"
          breadcrumbs={[{ label: 'Customers', onPress: () => router.push('/crm') }]}
        />
        <ErrorState title="Could not load this customer" error={error} onRetry={() => void refetch()} />
      </VStack>
    )
  }

  if (isPending) {
    return (
      <VStack gap={6}>
        <PageHeader title="Customer" />
        <Card padding={5}>
          <VStack gap={3}>
            <Skeleton width={200} height={24} />
            <Skeleton width={260} height={16} />
          </VStack>
        </Card>
      </VStack>
    )
  }

  return (
    <VStack gap={5}>
      <PageHeader
        title={customer.name}
        breadcrumbs={[
          { label: 'Customers', onPress: () => router.push('/crm') },
          { label: customer.name },
        ]}
        description={`Customer since ${formatDate(customer.createdAt)}`}
      />

      <Card padding={5}>
        <HStack gap={4} align="center" wrap>
          <Avatar name={customer.name} size="lg" />
          <VStack gap={0.5} style={{ minWidth: 0 }}>
            <Text variant="titleSm">{customer.name}</Text>
            <Text variant="bodySm" tone="muted">
              {customer.email}
            </Text>
            {customer.phone ? (
              <Text variant="bodySm" tone="muted">
                {customer.phone}
              </Text>
            ) : null}
          </VStack>
        </HStack>

        {customer.notes ? (
          <VStack gap={1} style={{ marginTop: theme.spacing[4] }}>
            <Text variant="caption" tone="subtle" weight="600">
              Notes
            </Text>
            <Text variant="bodySm">{customer.notes}</Text>
          </VStack>
        ) : null}
      </Card>

      <HStack gap={4} wrap>
        <StatTile label="Lifetime spend" value={formatMoney(customer.totalSpentCents)} />
        <StatTile label="Orders" value={String(customer.orderCount)} />
        <StatTile label="Average order" value={formatMoney(customer.averageOrderValueCents)} />
        <StatTile
          label="Last order"
          value={customer.lastOrderAt ? formatRelativeTime(customer.lastOrderAt) : 'Never'}
        />
      </HStack>

      <Card padding={0} header={<Text variant="heading">Recent orders</Text>}>
        <Table
          data={orders?.data ?? []}
          keyExtractor={(row) => row.id}
          loading={ordersPending}
          loadingRowCount={4}
          onRowPress={(row) => router.push(`/orders/${row.id}`)}
          accessibilityLabel="Recent orders for this customer"
          emptyState={
            <EmptyState
              size="sm"
              title="No orders yet"
              description="Orders placed by this customer will appear here."
            />
          }
          columns={[
            {
              key: 'orderNumber',
              header: 'Order',
              render: (row) => <MonoText variant="bodySm">{row.orderNumber}</MonoText>,
            },
            {
              key: 'status',
              header: 'Status',
              render: (row) => (
                <Badge tone={ORDER_STATUS_TONE[row.status]} variant="subtle" size="sm">
                  {ORDER_STATUS_LABEL[row.status]}
                </Badge>
              ),
            },
            {
              key: 'totalCents',
              header: 'Total',
              align: 'right',
              render: (row) => (
                <Text variant="bodySm" numeric weight="500">
                  {formatMoney(row.totalCents)}
                </Text>
              ),
            },
            {
              key: 'placedAt',
              header: 'Placed',
              align: 'right',
              render: (row) => (
                <Text variant="bodySm" tone="muted">
                  {formatRelativeTime(row.placedAt)}
                </Text>
              ),
            },
          ]}
        />
      </Card>
    </VStack>
  )
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <Card padding={4} style={{ flex: 1, minWidth: 160 }}>
      <VStack gap={1.5}>
        <Text variant="caption" tone="muted" weight="500">
          {label}
        </Text>
        <Text variant="titleSm" numeric>
          {value}
        </Text>
      </VStack>
    </Card>
  )
}
