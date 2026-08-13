/**
 * Home — the operations overview.
 *
 * Every figure on this screen comes from a single `GET /stats/overview` request, and the
 * screen performs no arithmetic of its own. Both properties are enforced by
 * `useDashboardOverview`, which owns the request and everything derived from it; this
 * file is layout only.
 */
import { useState } from 'react'
import { useRouter } from 'expo-router'

import type { GetDashboardOverviewRange } from '@odyssey/api-client'
import { pluralize } from '@odyssey/shared'
import { ORDER_STATUS_LABEL, ORDER_STATUS_TONE } from '@odyssey/types/domain'
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
import { useDashboardOverview } from '../../src/features/home/useDashboardOverview'
import { useMoney } from '../../src/lib/useMoney'
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
  const money = useMoney()
  const [range, setRange] = useState<GetDashboardOverviewRange>('today')

  const { data, isPending, isError, error, refetch, statusCounts, isEmpty } =
    useDashboardOverview(range)

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
          title={range === 'all' ? 'No orders yet' : 'Nothing in this range'}
          description={
            range === 'all'
              ? 'Seed the demo data to populate the dashboard, or create your first order.'
              : 'No orders were placed in this period. Try a wider range.'
          }
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
              value={money.compact(data.revenueCents)}
              caption="Excludes cancelled orders"
              tone="success"
              icon={<RevenueIcon size={17} color={theme.color.success} />}
            />
            <KpiTile
              label="Orders"
              value={String(data.totalOrders)}
              caption={`Average ${money.format(data.averageOrderValueCents)}`}
              tone="primary"
              icon={<OrdersIcon size={17} color={theme.color.primary} />}
            />
            <KpiTile
              label="Pending now"
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
              label="In the kitchen now"
              value={String(data.inProgressOrders)}
              caption="Accepted, preparing or ready"
              tone="info"
              icon={<InboxIcon size={17} color={theme.color.info} />}
            />
          </HStack>

          <Card padding={5} header={<Text variant="heading">Revenue trend</Text>}>
            <RevenueChart data={data.revenueTrend} />
          </Card>

          {/*
            The scope has to be spelled out.

            These chips are scoped to the selected range, whereas the "Pending" and "In the
            kitchen" tiles above are LIVE queue depths that ignore the range (an order
            placed last week that nobody accepted is still pending today). Without the
            qualifier the screen showed "Pending 5" in a tile and "Pending · 0" in a chip
            at the same time, which reads as a bug rather than as two different questions.
          */}
          <Card
            padding={5}
            header={
              <VStack gap={0.5}>
                <Text variant="heading">Orders by status</Text>
                <Text variant="caption" tone="subtle">
                  {`Placed in the selected range (${RANGES.find((r) => r.key === range)?.label ?? ''})`}
                </Text>
              </VStack>
            }
          >
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
                      {money.format(row.revenueCents)}
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
