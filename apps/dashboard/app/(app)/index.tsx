/**
 * Home — the operations overview.
 *
 * Every figure on this screen comes from a single `GET /stats/overview` request. That is
 * deliberate: six separate KPI requests would each open their own Worker-scoped database
 * connection and could observe the database at six different instants, so the tiles and
 * the chart would not reconcile with each other. One request, one snapshot.
 *
 * The screen performs no arithmetic of its own. Revenue is summed in SQL, averages are
 * computed server-side, and cancelled orders are already excluded — summing a *page* of
 * results in the client would produce a confidently wrong number.
 */
import { useMemo, useState } from 'react'
import { useRouter } from 'expo-router'

import { useGetDashboardOverview } from '@odyssey/api-client'
import type { GetDashboardOverviewRange } from '@odyssey/api-client'
import { formatMoney, formatMoneyCompact, pluralize } from '@odyssey/shared'
import {
  ORDER_STATUSES,
  ORDER_STATUS_LABEL,
  ORDER_STATUS_TONE,
} from '@odyssey/types/domain'
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  HStack,
  PageHeader,
  Skeleton,
  Table,
  Tabs,
  Text,
  VStack,
  useBreakpoint,
  useTheme,
} from '@odyssey/ui'

import { KpiTile, KpiTileSkeleton } from '../../src/features/home/KpiTile'
import { RevenueChart } from '../../src/features/home/RevenueChart'
import { ClockIcon, InboxIcon, OrdersIcon, RevenueIcon } from '../../src/components/icons'

const RANGES: { key: GetDashboardOverviewRange; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
  { key: 'all', label: 'All time' },
]

export default function HomeScreen() {
  const theme = useTheme()
  const router = useRouter()
  const breakpoint = useBreakpoint()
  const [range, setRange] = useState<GetDashboardOverviewRange>('today')

  const { data, isPending, isError, error, refetch } = useGetDashboardOverview({ range })

  /**
   * The API guarantees every status is present, including zeros. Re-deriving the list
   * from ORDER_STATUSES rather than from the response keeps the chip order stable across
   * ranges — sorting by count would make chips jump around as data changes.
   */
  const statusCounts = useMemo(() => {
    const byStatus = new Map(data?.ordersByStatus.map((entry) => [entry.status, entry.count]))
    return ORDER_STATUSES.map((status) => ({ status, count: byStatus.get(status) ?? 0 }))
  }, [data])

  const rangeSelector = (
    <Tabs
      items={RANGES.map((entry) => ({ key: entry.key, label: entry.label }))}
      value={range}
      onChange={(key) => setRange(key as GetDashboardOverviewRange)}
      accessibilityLabel="Time range"
      fullWidth={breakpoint === 'sm'}
    />
  )

  if (isError) {
    return (
      <VStack gap={6}>
        <PageHeader title="Overview" description="How the restaurant is performing." />
        <ErrorState
          title="Could not load the dashboard"
          description="The API did not respond. Check that the backend is running on port 8787."
          error={error}
          onRetry={() => void refetch()}
        />
      </VStack>
    )
  }

  if (isPending) {
    return (
      <VStack gap={6}>
        <PageHeader title="Overview" description="How the restaurant is performing." />
        {rangeSelector}
        <HStack gap={4} wrap>
          <KpiTileSkeleton />
          <KpiTileSkeleton />
          <KpiTileSkeleton />
          <KpiTileSkeleton />
        </HStack>
        <Card padding={5}>
          <VStack gap={3}>
            <Skeleton width={140} height={18} />
            <Skeleton width="100%" height={180} />
          </VStack>
        </Card>
      </VStack>
    )
  }

  /**
   * A freshly migrated database returns a valid response of all zeros. Rendering a wall
   * of "$0.00" would look like a broken dashboard, so the empty state names the actual
   * next step instead.
   */
  const isEmpty = data.totalOrders === 0 && data.pendingOrders === 0 && data.revenueCents === 0

  return (
    <VStack gap={6}>
      <PageHeader
        title="Overview"
        description="How the restaurant is performing."
        actions={
          <Button variant="secondary" onPress={() => router.push('/orders')}>
            View orders
          </Button>
        }
      />

      {rangeSelector}

      {isEmpty ? (
        <EmptyState
          title="No orders yet"
          description="Seed the demo data to populate the dashboard, or create your first order."
          icon={<InboxIcon size={24} color={theme.color.textSubtle} />}
          action={
            <Button variant="primary" onPress={() => router.push('/orders')}>
              Go to orders
            </Button>
          }
        />
      ) : (
        <>
          {data.pendingOrders > 0 ? (
            <Alert
              tone="warning"
              title={`${pluralize(data.pendingOrders, 'order')} awaiting acceptance`}
              description="Orders sitting in pending are not yet visible to the kitchen."
              action={
                <Button variant="secondary" size="sm" onPress={() => router.push('/orders')}>
                  Review pending
                </Button>
              }
            />
          ) : null}

          <HStack gap={4} wrap>
            <KpiTile
              label="Revenue"
              value={formatMoneyCompact(data.revenueCents)}
              caption="Excludes cancelled orders"
              tone="success"
              icon={<RevenueIcon size={17} color={theme.color.success} />}
            />
            <KpiTile
              label="Orders"
              value={String(data.totalOrders)}
              caption={`Average ${formatMoney(data.averageOrderValueCents)}`}
              tone="primary"
              icon={<OrdersIcon size={17} color={theme.color.primary} />}
            />
            <KpiTile
              label="Pending"
              value={String(data.pendingOrders)}
              caption="Awaiting acceptance now"
              tone={data.pendingOrders > 0 ? 'warning' : 'neutral'}
              icon={
                <ClockIcon
                  size={17}
                  color={data.pendingOrders > 0 ? theme.color.warning : theme.color.textSubtle}
                />
              }
            />
            <KpiTile
              label="In the kitchen"
              value={String(data.inProgressOrders)}
              caption="Accepted, preparing or ready"
              tone="info"
              icon={<InboxIcon size={17} color={theme.color.info} />}
            />
          </HStack>

          <Card padding={5} header={<Text variant="heading">Revenue trend</Text>}>
            <RevenueChart data={data.revenueTrend} />
          </Card>

          <Card padding={5} header={<Text variant="heading">Orders by status</Text>}>
            <HStack gap={2} wrap>
              {statusCounts.map(({ status, count }) => (
                <Badge key={status} tone={ORDER_STATUS_TONE[status]} variant="subtle">
                  {`${ORDER_STATUS_LABEL[status]} · ${count}`}
                </Badge>
              ))}
            </HStack>
          </Card>

          <Card padding={0} header={<Text variant="heading">Popular items</Text>}>
            <Table
              data={data.popularItems}
              keyExtractor={(row) => row.menuItemId}
              accessibilityLabel="Popular menu items"
              emptyState={
                <EmptyState
                  size="sm"
                  title="Nothing sold in this range"
                  description="Popular items appear once orders are placed."
                />
              }
              columns={[
                {
                  key: 'name',
                  header: 'Item',
                  render: (row) => <Text variant="bodySm">{row.name}</Text>,
                },
                {
                  key: 'quantitySold',
                  header: 'Sold',
                  align: 'right',
                  render: (row) => (
                    <Text variant="bodySm" numeric>
                      {row.quantitySold}
                    </Text>
                  ),
                },
                {
                  key: 'revenueCents',
                  header: 'Revenue',
                  align: 'right',
                  render: (row) => (
                    <Text variant="bodySm" numeric weight="500">
                      {formatMoney(row.revenueCents)}
                    </Text>
                  ),
                },
              ]}
            />
          </Card>
        </>
      )}
    </VStack>
  )
}
