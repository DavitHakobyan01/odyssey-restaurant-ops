/**
 * Orders list — the screen an operator lives in during service.
 *
 * Filtering, sorting and pagination are all pushed to the server. This matters: the
 * Table primitive deliberately refuses to sort its own `data`, because sorting the 25
 * rows that happen to be on screen produces a confidently wrong answer when there are
 * 140 orders behind them.
 *
 * The query itself — filters, debounced search, params and paging — lives in
 * `useOrdersList`, so this file is the filter bar, the columns and the layout.
 */
import { useMemo, useState } from 'react'
import { useRouter } from 'expo-router'

import type { OrderSummary } from '@odyssey/api-client'
import { formatRelativeTime, pluralize } from '@odyssey/shared'
import {
  ORDER_STATUSES,
  ORDER_STATUS_LABEL,
  ORDER_STATUS_TONE,
  ORDER_TYPES,
  ORDER_TYPE_LABEL,
} from '@odyssey/types/domain'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  HStack,
  Input,
  MonoText,
  MultiSelect,
  PageHeader,
  Select,
  Table,
  Text,
  VStack,
  useTheme,
} from '@odyssey/ui'

import { InboxIcon, SearchIcon } from '../../../src/components/icons'
import { Pagination } from '../../../src/components/Pagination'
import { CreateOrderModal } from '../../../src/features/orders/CreateOrderModal'
import { useOrdersList } from '../../../src/features/orders/useOrdersList'
import { useMoney } from '../../../src/lib/useMoney'

export default function OrdersScreen() {
  const router = useRouter()
  const theme = useTheme()
  const money = useMoney()

  const {
    filters,
    hasFilters,
    changeStatuses,
    changeType,
    changeSearch,
    changeSort,
    resetFilters,
    offset,
    setOffset,
    pageSize,
    rows,
    total,
    hasMore,
    isPending,
    isFetching,
    isError,
    error,
    refetch,
  } = useOrdersList()

  const [createOpen, setCreateOpen] = useState(false)

  const columns = useMemo(
    () => [
      {
        key: 'orderNumber',
        header: 'Order',
        render: (row: OrderSummary) => <MonoText variant="bodySm">{row.orderNumber}</MonoText>,
      },
      {
        key: 'customer',
        header: 'Customer',
        render: (row: OrderSummary) => (
          <VStack gap={0}>
            <Text variant="bodySm" weight="500" numberOfLines={1}>
              {row.customer.name}
            </Text>
            <Text variant="caption" tone="subtle" numberOfLines={1}>
              {row.customer.email}
            </Text>
          </VStack>
        ),
      },
      {
        key: 'status',
        header: 'Status',
        sortable: true,
        render: (row: OrderSummary) => (
          <Badge tone={ORDER_STATUS_TONE[row.status]} variant="subtle" size="sm">
            {ORDER_STATUS_LABEL[row.status]}
          </Badge>
        ),
      },
      {
        key: 'type',
        header: 'Type',
        // Hidden on phones: seven stacked label/value pairs per order made each card
        // ~200px tall, so barely one order fitted on screen during service.
        hideOnMobile: true,
        render: (row: OrderSummary) => (
          <Text variant="bodySm" tone="muted">
            {ORDER_TYPE_LABEL[row.type]}
          </Text>
        ),
      },
      {
        key: 'itemCount',
        header: 'Items',
        align: 'right' as const,
        hideOnMobile: true,
        render: (row: OrderSummary) => (
          <Text variant="bodySm" numeric tone="muted">
            {row.itemCount}
          </Text>
        ),
      },
      {
        key: 'totalCents',
        header: 'Total',
        align: 'right' as const,
        sortable: true,
        render: (row: OrderSummary) => (
          <Text variant="bodySm" numeric weight="500">
            {money.format(row.totalCents)}
          </Text>
        ),
      },
      {
        key: 'placedAt',
        header: 'Placed',
        align: 'right' as const,
        sortable: true,
        render: (row: OrderSummary) => (
          <Text variant="bodySm" tone="muted">
            {formatRelativeTime(row.placedAt)}
          </Text>
        ),
      },
    ],
    [money],
  )

  if (isError) {
    return (
      <VStack gap={6}>
        <PageHeader title="Orders" />
        <ErrorState
          title="Could not load orders"
          description="The API did not respond. Check that the backend is running on port 8787."
          error={error}
          onRetry={() => void refetch()}
        />
      </VStack>
    )
  }

  return (
    <VStack gap={5}>
      <PageHeader
        title="Orders"
        description={
          isPending ? 'Loading…' : `${pluralize(total, 'order')}${hasFilters ? ' matching filters' : ''}`
        }
        actions={
          <Button variant="primary" onPress={() => setCreateOpen(true)}>
            New order
          </Button>
        }
      />

      <CreateOrderModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(orderId) => router.push(`/orders/${orderId}`)}
      />

      <Card padding={4}>
        <HStack gap={3} wrap align="flex-end">
          <VStack gap={1} style={{ flex: 1, minWidth: 220 }}>
            <Input
              value={filters.searchInput}
              onChangeText={changeSearch}
              placeholder="Search order number, customer or email"
              leftSlot={<SearchIcon size={16} color={theme.color.textSubtle} />}
              accessibilityLabel="Search orders"
              testID="orders-search"
            />
          </VStack>

          <VStack gap={1} style={{ minWidth: 200 }}>
            <MultiSelect
              value={filters.statuses}
              onChange={changeStatuses}
              placeholder="All statuses"
              accessibilityLabel="Filter by status"
              options={ORDER_STATUSES.map((status) => ({
                label: ORDER_STATUS_LABEL[status],
                value: status,
              }))}
            />
          </VStack>

          <VStack gap={1} style={{ minWidth: 160 }}>
            <Select
              value={filters.type}
              onChange={changeType}
              placeholder="All types"
              accessibilityLabel="Filter by order type"
              options={[
                { label: 'All types', value: '' },
                ...ORDER_TYPES.map((value) => ({ label: ORDER_TYPE_LABEL[value], value })),
              ]}
            />
          </VStack>

          {hasFilters ? (
            <Button variant="ghost" onPress={resetFilters}>
              Clear
            </Button>
          ) : null}
        </HStack>
      </Card>

      <Card padding={0}>
        <Table
          data={rows}
          columns={columns}
          keyExtractor={(row) => row.id}
          loading={isPending}
          loadingRowCount={8}
          onRowPress={(row) => router.push(`/orders/${row.id}`)}
          accessibilityLabel="Orders"
          sortBy={filters.sortBy}
          sortDir={filters.sortDir}
          onSortChange={changeSort}
          emptyState={
            <EmptyState
              title={hasFilters ? 'No orders match these filters' : 'No orders yet'}
              description={
                hasFilters
                  ? 'Try widening the status or type filter, or clearing the search.'
                  : 'Orders placed through the API will appear here.'
              }
              icon={<InboxIcon size={24} color={theme.color.textSubtle} />}
              action={
                hasFilters ? (
                  <Button variant="secondary" onPress={resetFilters}>
                    Clear filters
                  </Button>
                ) : undefined
              }
            />
          }
        />
      </Card>

      <Pagination
        offset={offset}
        pageSize={pageSize}
        total={total}
        hasMore={hasMore}
        busy={isFetching}
        onOffsetChange={setOffset}
      />
    </VStack>
  )
}
