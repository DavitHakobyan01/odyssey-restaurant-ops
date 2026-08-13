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
import { useMemo, useState } from 'react'
import { keepPreviousData } from '@tanstack/react-query'
import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'expo-router'

import {
  ApiClientError,
  getListCustomersQueryKey,
  useCreateCustomer,
  useListCustomers,
} from '@odyssey/api-client'
import type { CustomerWithStats, ListCustomersParams, ListCustomersSortBy } from '@odyssey/api-client'
import { formatMoney, formatRelativeTime, pluralize } from '@odyssey/shared'
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
  useToast,
} from '@odyssey/ui'

import { CustomersIcon, SearchIcon } from '../../../src/components/icons'
import { useDebouncedValue } from '../../../src/features/orders/useDebouncedValue'

const PAGE_SIZE = 25

export default function CrmScreen() {
  const theme = useTheme()
  const router = useRouter()
  const toast = useToast()
  const queryClient = useQueryClient()

  const [searchInput, setSearchInput] = useState('')
  const [sortBy, setSortBy] = useState<ListCustomersSortBy>('lastOrderAt')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [offset, setOffset] = useState(0)
  const [createOpen, setCreateOpen] = useState(false)
  const [draft, setDraft] = useState({ name: '', email: '', phone: '', notes: '' })
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const search = useDebouncedValue(searchInput, 300)

  const params = useMemo<ListCustomersParams>(() => {
    const next: ListCustomersParams = { limit: PAGE_SIZE, offset, sortBy, sortDir }
    if (search.trim().length > 0) next.search = search.trim()
    return next
  }, [offset, sortBy, sortDir, search])

  const { data, isPending, isError, error, refetch, isFetching } = useListCustomers(params, {
    query: { placeholderData: keepPreviousData },
  })

  const createCustomer = useCreateCustomer()

  const submit = async () => {
    const errors: Record<string, string> = {}
    if (draft.name.trim().length === 0) errors.name = 'Name is required.'
    if (!/^\S+@\S+\.\S+$/.test(draft.email.trim())) errors.email = 'Enter a valid email address.'
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }

    try {
      await createCustomer.mutateAsync({
        data: {
          name: draft.name.trim(),
          email: draft.email.trim(),
          phone: draft.phone.trim() === '' ? null : draft.phone.trim(),
          notes: draft.notes.trim() === '' ? null : draft.notes.trim(),
        },
      })
      await queryClient.invalidateQueries({ queryKey: getListCustomersQueryKey() })
      toast.success('Customer added', draft.name.trim())
      setDraft({ name: '', email: '', phone: '', notes: '' })
      setFieldErrors({})
      setCreateOpen(false)
    } catch (caught) {
      if (caught instanceof ApiClientError) {
        // A duplicate email comes back as 409 with the offending field named.
        setFieldErrors(
          caught.code === 'CONFLICT'
            ? { email: caught.message, ...caught.fieldErrors }
            : caught.fieldErrors,
        )
        toast.error('Could not add the customer', caught.message)
      } else {
        toast.error('Could not add the customer', 'Please try again.')
      }
    }
  }

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
            {formatMoney(row.totalSpentCents)}
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
            {formatMoney(row.averageOrderValueCents)}
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
    [],
  )

  if (isError) {
    return (
      <VStack gap={6}>
        <PageHeader title="Customers" />
        <ErrorState title="Could not load customers" error={error} onRetry={() => void refetch()} />
      </VStack>
    )
  }

  const total = data?.pagination.total ?? 0

  return (
    <VStack gap={5}>
      <PageHeader
        title="Customers"
        description={isPending ? 'Loading…' : pluralize(total, 'customer')}
        actions={
          <Button variant="primary" onPress={() => setCreateOpen(true)}>
            Add customer
          </Button>
        }
      />

      <Card padding={4}>
        <Input
          value={searchInput}
          onChangeText={(value) => {
            setSearchInput(value)
            setOffset(0)
          }}
          placeholder="Search by name or email"
          leftSlot={<SearchIcon size={16} color={theme.color.textSubtle} />}
          accessibilityLabel="Search customers"
        />
      </Card>

      <Card padding={0}>
        <Table
          data={data?.data ?? []}
          columns={columns}
          keyExtractor={(row) => row.id}
          loading={isPending}
          loadingRowCount={8}
          onRowPress={(row) => router.push(`/crm/${row.id}`)}
          accessibilityLabel="Customers"
          sortBy={sortBy}
          sortDir={sortDir}
          onSortChange={(key, direction) => {
            setSortBy(key as ListCustomersSortBy)
            setSortDir(direction)
            setOffset(0)
          }}
          emptyState={
            <EmptyState
              title={search ? 'No customers match that search' : 'No customers yet'}
              description={
                search
                  ? 'Try a different name or email.'
                  : 'Customers are created automatically when an order is placed for a new email.'
              }
              icon={<CustomersIcon size={24} color={theme.color.textSubtle} />}
            />
          }
        />
      </Card>

      {total > PAGE_SIZE ? (
        <HStack gap={3} align="center" justify="flex-end">
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

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Add customer"
        description="Email must be unique — it is how repeat orders are linked to one history."
        footer={
          <>
            <Button variant="secondary" onPress={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" loading={createCustomer.isPending} onPress={() => void submit()}>
              Add customer
            </Button>
          </>
        }
      >
        <VStack gap={4}>
          <Field label="Name" required error={fieldErrors.name}>
            <Input
              value={draft.name}
              onChangeText={(name) => setDraft((current) => ({ ...current, name }))}
              placeholder="e.g. Amara Okafor"
              invalid={Boolean(fieldErrors.name)}
              autoFocus
            />
          </Field>
          <Field label="Email" required error={fieldErrors.email}>
            <Input
              value={draft.email}
              onChangeText={(email) => setDraft((current) => ({ ...current, email }))}
              placeholder="name@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              invalid={Boolean(fieldErrors.email)}
            />
          </Field>
          <Field label="Phone" error={fieldErrors.phone}>
            <Input
              value={draft.phone}
              onChangeText={(phone) => setDraft((current) => ({ ...current, phone }))}
              placeholder="Optional"
              keyboardType="phone-pad"
            />
          </Field>
          <Field label="Notes">
            <Textarea
              value={draft.notes}
              onChangeText={(notes) => setDraft((current) => ({ ...current, notes }))}
              placeholder="Allergies, preferences, anything the kitchen should know"
            />
          </Field>
        </VStack>
      </Modal>
    </VStack>
  )
}
