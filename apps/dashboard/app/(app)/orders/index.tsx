/**
 * Orders list — the screen an operator lives in during service.
 *
 * Filtering, sorting and pagination are all pushed to the server. This matters: the
 * Table primitive deliberately refuses to sort its own `data`, because sorting the 25
 * rows that happen to be on screen produces a confidently wrong answer when there are
 * 140 orders behind them.
 *
 * Search is debounced, so typing an order number issues one request rather than one per
 * keystroke — each of which would open its own database connection on the Worker.
 */
import { useMemo, useState } from 'react'
import { keepPreviousData } from '@tanstack/react-query'
import { useRouter } from 'expo-router'

import { useListOrders } from '@odyssey/api-client'
import type { ListOrdersParams, ListOrdersSortBy, OrderSummary } from '@odyssey/api-client'
import { formatMoney, formatRelativeTime, pluralize } from '@odyssey/shared'
import {
  ORDER_STATUSES,
  ORDER_STATUS_LABEL,
  ORDER_STATUS_TONE,
  ORDER_TYPES,
  ORDER_TYPE_LABEL,
  type OrderStatus,
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
  useBreakpoint,
  useTheme,
} from '@odyssey/ui'

import { InboxIcon, SearchIcon } from '../../../src/components/icons'
import { CreateOrderModal } from '../../../src/features/orders/CreateOrderModal'
import { useDebouncedValue } from '../../../src/features/orders/useDebouncedValue'

const PAGE_SIZE = 25

export default function OrdersScreen() {
  const router = useRouter()
  const theme = useTheme()
  const breakpoint = useBreakpoint()

  const [statuses, setStatuses] = useState<OrderStatus[]>([])
  const [type, setType] = useState<string>('')
  const [searchInput, setSearchInput] = useState('')
  const [sortBy, setSortBy] = useState<ListOrdersSortBy>('placedAt')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [offset, setOffset] = useState(0)
  const [createOpen, setCreateOpen] = useState(false)

  const search = useDebouncedValue(searchInput, 300)

  /**
   * Built as one memoised object so the query key is stable — rebuilding it inline on
   * every render would give React Query a new key each time and refetch continuously.
   *
   * Empty values are omitted rather than sent as empty strings, because the API validates
   * `search` with a minimum length of 1 and would reject `?search=`.
   */
  const params = useMemo<ListOrdersParams>(() => {
    const next: ListOrdersParams = { limit: PAGE_SIZE, offset, sortBy, sortDir }
    if (statuses.length > 0) next.status = statuses
    if (type) next.type = type as ListOrdersParams['type']
    if (search.trim().length > 0) next.search = search.trim()
    return next
  }, [offset, sortBy, sortDir, statuses, type, search])

  /**
   * `keepPreviousData` matters for pagination: without it, pressing Next swaps the table
   * for skeleton rows and the page visibly jumps. With it the current page stays on
   * screen until the next one arrives, and only `isFetching` flips. The very first load
   * still shows skeletons, because there is nothing to keep.
   */
  const { data, isPending, isError, error, refetch, isFetching } = useListOrders(params, {
    query: { placeholderData: keepPreviousData },
  })

  const hasFilters = statuses.length > 0 || type !== '' || search.trim().length > 0

  const resetFilters = () => {
    setStatuses([])
    setType('')
    setSearchInput('')
    setOffset(0)
  }

  /** Any filter change must return to page one, or the operator lands on an empty page. */
  const onFilterChange = <T,>(setter: (value: T) => void) => (value: T) => {
    setter(value)
    setOffset(0)
  }

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
            {formatMoney(row.totalCents)}
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
    [],
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

  const total = data?.pagination.total ?? 0
  const rows = data?.data ?? []

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
              value={searchInput}
              onChangeText={onFilterChange(setSearchInput)}
              placeholder="Search order number, customer or email"
              leftSlot={<SearchIcon size={16} color={theme.color.textSubtle} />}
              accessibilityLabel="Search orders"
              testID="orders-search"
            />
          </VStack>

          <VStack gap={1} style={{ minWidth: 200 }}>
            <MultiSelect
              value={statuses}
              onChange={onFilterChange(setStatuses)}
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
              value={type}
              onChange={onFilterChange(setType)}
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
          sortBy={sortBy}
          sortDir={sortDir}
          onSortChange={(key, direction) => {
            setSortBy(key as ListOrdersSortBy)
            setSortDir(direction)
            setOffset(0)
          }}
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

      {total > PAGE_SIZE ? (
        <HStack gap={3} align="center" justify={breakpoint === 'sm' ? 'center' : 'flex-end'}>
          <Text variant="bodySm" tone="muted">
            {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
          </Text>
          <Button
            variant="secondary"
            size="sm"
            disabled={offset === 0 || isFetching}
            onPress={() => setOffset((current) => Math.max(0, current - PAGE_SIZE))}
          >
            Previous
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={!data?.pagination.hasMore || isFetching}
            onPress={() => setOffset((current) => current + PAGE_SIZE)}
          >
            Next
          </Button>
        </HStack>
      ) : null}
    </VStack>
  )
}
