/**
 * CRM — customer list with lifetime aggregates.
 *
 * Order count, lifetime spend and last-order date are computed in SQL by the API, and
 * sorting by any of them sorts the *whole* dataset server-side. Sorting a fetched page in
 * the client would rank 25 rows out of 140 and confidently show the wrong "top customer",
 * which is why the sort controls drive the query rather than the array.
 *
 * Cancelled orders are excluded from every aggregate by the backend — a cancelled order
 * is not spend.
 */
import { useMemo } from 'react'
import { useRouter } from 'expo-router'

import type { CustomerWithStats } from '@odyssey/api-client'
import { formatRelativeTime, pluralize } from '@odyssey/shared'
import {
  Avatar,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  HStack,
  Input,
  Modal,
  PageHeader,
  Table,
  Text,
  Textarea,
  VStack,
  useTheme,
} from '@odyssey/ui'

import { CustomersIcon, SearchIcon } from '../../../src/components/icons'
import { Pagination } from '../../../src/components/Pagination'
import { useCustomerList } from '../../../src/features/crm/useCustomerList'
import { useMoney } from '../../../src/lib/useMoney'

export default function CrmScreen() {
  const theme = useTheme()
  const router = useRouter()
  const money = useMoney()
  const list = useCustomerList()

  const columns = useMemo(
    () => [
      {
        key: 'name',
        header: 'Customer',
        sortable: true,
        render: (row: CustomerWithStats) => (
          <HStack gap={3} align="center">
            <Avatar name={row.name} size="sm" />
            <VStack gap={0} style={{ minWidth: 0 }}>
              <Text variant="bodySm" weight="500" numberOfLines={1}>
                {row.name}
              </Text>
              <Text variant="caption" tone="subtle" numberOfLines={1}>
                {row.email}
              </Text>
            </VStack>
          </HStack>
        ),
      },
      {
        key: 'orderCount',
        header: 'Orders',
        align: 'right' as const,
        sortable: true,
        render: (row: CustomerWithStats) => (
          <Text variant="bodySm" numeric>
            {row.orderCount}
          </Text>
        ),
      },
      {
        key: 'totalSpent',
        header: 'Lifetime spend',
        align: 'right' as const,
        sortable: true,
        render: (row: CustomerWithStats) => (
          <Text variant="bodySm" numeric weight="600">
            {money.format(row.totalSpentCents)}
          </Text>
        ),
      },
      {
        key: 'averageOrderValueCents',
        header: 'Average',
        align: 'right' as const,
        // Hidden on phones: it is spend divided by orders, both of which stay visible.
        hideOnMobile: true,
        render: (row: CustomerWithStats) => (
          <Text variant="bodySm" numeric tone="muted">
            {money.format(row.averageOrderValueCents)}
          </Text>
        ),
      },
      {
        key: 'lastOrderAt',
        header: 'Last order',
        align: 'right' as const,
        sortable: true,
        render: (row: CustomerWithStats) => (
          <Text variant="bodySm" tone={row.lastOrderAt ? 'muted' : 'subtle'}>
            {row.lastOrderAt ? formatRelativeTime(row.lastOrderAt) : 'Never'}
          </Text>
        ),
      },
    ],
    [money],
  )

  if (list.isError) {
    return (
      <VStack gap={6}>
        <PageHeader title="Customers" />
        <ErrorState
          title="Could not load customers"
          error={list.error}
          onRetry={() => void list.refetch()}
        />
      </VStack>
    )
  }

  return (
    <VStack gap={5}>
      <PageHeader
        title="Customers"
        description={list.isPending ? 'Loading…' : pluralize(list.total, 'customer')}
        actions={
          <Button variant="primary" onPress={list.openCreate}>
            Add customer
          </Button>
        }
      />

      <Card padding={4}>
        <Input
          value={list.searchInput}
          onChangeText={list.setSearch}
          placeholder="Search by name or email"
          leftSlot={<SearchIcon size={16} color={theme.color.textSubtle} />}
          accessibilityLabel="Search customers"
        />
      </Card>

      <Card padding={0}>
        <Table
          data={list.customers}
          columns={columns}
          keyExtractor={(row) => row.id}
          loading={list.isPending}
          loadingRowCount={8}
          onRowPress={(row) => router.push(`/crm/${row.id}`)}
          accessibilityLabel="Customers"
          sortBy={list.sortBy}
          sortDir={list.sortDir}
          onSortChange={list.setSort}
          emptyState={
            <EmptyState
              title={list.search ? 'No customers match that search' : 'No customers yet'}
              description={
                list.search
                  ? 'Try a different name or email.'
                  : 'Customers are created automatically when an order is placed for a new email.'
              }
              icon={<CustomersIcon size={24} color={theme.color.textSubtle} />}
            />
          }
        />
      </Card>

      <Pagination
        offset={list.offset}
        pageSize={list.pageSize}
        total={list.total}
        hasMore={list.hasMore}
        busy={list.isFetching}
        onOffsetChange={list.setOffset}
      />

      <Modal
        open={list.isCreateOpen}
        onClose={list.closeCreate}
        title="Add customer"
        description="Email must be unique — it is how repeat orders are linked to one history."
        footer={
          <>
            <Button variant="secondary" onPress={list.closeCreate}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={list.isCreating}
              onPress={() => void list.submitCreate()}
            >
              Add customer
            </Button>
          </>
        }
      >
        <VStack gap={4}>
          <Field label="Name" required error={list.fieldErrors.name}>
            <Input
              value={list.draft.name}
              onChangeText={(name) => list.updateDraft('name', name)}
              placeholder="e.g. Amara Okafor"
              invalid={Boolean(list.fieldErrors.name)}
              autoFocus
            />
          </Field>
          <Field label="Email" required error={list.fieldErrors.email}>
            <Input
              value={list.draft.email}
              onChangeText={(email) => list.updateDraft('email', email)}
              placeholder="name@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              invalid={Boolean(list.fieldErrors.email)}
            />
          </Field>
          <Field label="Phone" error={list.fieldErrors.phone}>
            <Input
              value={list.draft.phone}
              onChangeText={(phone) => list.updateDraft('phone', phone)}
              placeholder="Optional"
              keyboardType="phone-pad"
            />
          </Field>
          <Field label="Notes">
            <Textarea
              value={list.draft.notes}
              onChangeText={(notes) => list.updateDraft('notes', notes)}
              placeholder="Allergies, preferences, anything the kitchen should know"
            />
          </Field>
        </VStack>
      </Modal>
    </VStack>
  )
}
