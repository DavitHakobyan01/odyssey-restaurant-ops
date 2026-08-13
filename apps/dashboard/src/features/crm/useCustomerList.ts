/**
 * State and orchestration behind the CRM customer list.
 *
 * The screen itself is a table, a search box and a modal; everything that decides *what*
 * that table shows — the debounced search term, the sort, the page offset, the query
 * params they combine into, and the create-customer write — lives here so the route file
 * reads as layout.
 *
 * Sorting deliberately drives the API query rather than reordering the fetched array.
 * Order count, lifetime spend and last-order date are computed in SQL across the *whole*
 * dataset; ranking the 25 rows of one page in the client would confidently show the wrong
 * "top customer" out of 140.
 */
import { useCallback, useMemo, useState } from 'react'
import { keepPreviousData, useQueryClient } from '@tanstack/react-query'

import {
  ApiClientError,
  getListCustomersQueryKey,
  useCreateCustomer,
  useListCustomers,
} from '@odyssey/api-client'
import type { ListCustomersParams, ListCustomersSortBy } from '@odyssey/api-client'
import { useToast } from '@odyssey/ui'

import { describeError, fieldErrorsOf } from '../../lib/errors'
import { useDebouncedValue } from '../orders/useDebouncedValue'

export const CUSTOMER_PAGE_SIZE = 25

const SEARCH_DEBOUNCE_MS = 300

export type CustomerDraft = {
  name: string
  email: string
  phone: string
  notes: string
}

const EMPTY_DRAFT: CustomerDraft = { name: '', email: '', phone: '', notes: '' }

/**
 * Client-side validation, kept to the two rules the operator can fix without a round trip.
 *
 * Anything subtler (a duplicate email, a phone the server rejects) is left to the API and
 * bound back onto the same fields, so there is exactly one place a rule is stated.
 */
function validateDraft(draft: CustomerDraft): Record<string, string> {
  const errors: Record<string, string> = {}
  if (draft.name.trim().length === 0) errors.name = 'Name is required.'
  if (!/^\S+@\S+\.\S+$/.test(draft.email.trim())) errors.email = 'Enter a valid email address.'
  return errors
}

export function useCustomerList() {
  const toast = useToast()
  const queryClient = useQueryClient()

  const [searchInput, setSearchInput] = useState('')
  const [sortBy, setSortBy] = useState<ListCustomersSortBy>('lastOrderAt')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [offset, setOffset] = useState(0)

  const search = useDebouncedValue(searchInput, SEARCH_DEBOUNCE_MS)

  const params = useMemo<ListCustomersParams>(() => {
    const next: ListCustomersParams = {
      limit: CUSTOMER_PAGE_SIZE,
      offset,
      sortBy,
      sortDir,
    }
    if (search.trim().length > 0) next.search = search.trim()
    return next
  }, [offset, sortBy, sortDir, search])

  const { data, isPending, isError, error, refetch, isFetching } = useListCustomers(params, {
    // Keeps the previous page on screen while the next one loads, so paging and sorting
    // do not flash the table back to skeletons.
    query: { placeholderData: keepPreviousData },
  })

  const setSearch = useCallback((value: string) => {
    setSearchInput(value)
    // A narrower result set makes any deep offset meaningless.
    setOffset(0)
  }, [])

  const setSort = useCallback((key: string, direction: 'asc' | 'desc') => {
    setSortBy(key as ListCustomersSortBy)
    setSortDir(direction)
    setOffset(0)
  }, [])

  /* ----------------------------- Create customer ---------------------------- */

  const [isCreateOpen, setCreateOpen] = useState(false)
  const [draft, setDraft] = useState<CustomerDraft>(EMPTY_DRAFT)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const createCustomer = useCreateCustomer()

  const openCreate = useCallback(() => setCreateOpen(true), [])

  /**
   * Closing discards the draft *and* the validation messages.
   *
   * Without the reset, an operator who cancelled after a failed attempt reopened the modal
   * to red fields describing a submission they had already abandoned.
   */
  const closeCreate = useCallback(() => {
    setCreateOpen(false)
    setDraft(EMPTY_DRAFT)
    setFieldErrors({})
  }, [])

  const updateDraft = useCallback(<K extends keyof CustomerDraft>(field: K, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }))
    // Editing a field is the operator answering its complaint; keeping the message up
    // until the next submit just leaves stale red on a value they have already fixed.
    setFieldErrors((current) => {
      if (current[field] === undefined) return current
      const next = { ...current }
      delete next[field]
      return next
    })
  }, [])

  const submitCreate = useCallback(async () => {
    const errors = validateDraft(draft)
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }

    const name = draft.name.trim()
    try {
      await createCustomer.mutateAsync({
        data: {
          name,
          email: draft.email.trim(),
          phone: draft.phone.trim() === '' ? null : draft.phone.trim(),
          notes: draft.notes.trim() === '' ? null : draft.notes.trim(),
        },
      })
      await queryClient.invalidateQueries({ queryKey: getListCustomersQueryKey() })
      toast.success('Customer added', name)
      closeCreate()
    } catch (caught) {
      if (caught instanceof ApiClientError) {
        // A duplicate email comes back as 409 with the offending field named.
        setFieldErrors(
          caught.code === 'CONFLICT'
            ? { email: caught.message, ...fieldErrorsOf(caught) }
            : fieldErrorsOf(caught),
        )
      }
      toast.error('Could not add the customer', describeError(caught))
    }
  }, [closeCreate, createCustomer, draft, queryClient, toast])

  return {
    /* Query */
    customers: data?.data ?? [],
    total: data?.pagination.total ?? 0,
    hasMore: data?.pagination.hasMore ?? false,
    isPending,
    isError,
    error,
    isFetching,
    refetch,

    /* Search */
    searchInput,
    setSearch,
    /** The debounced term the current page was actually fetched with. */
    search,

    /* Sort — these feed the query, never a client-side sort of the fetched page. */
    sortBy,
    sortDir,
    setSort,

    /* Paging */
    offset,
    setOffset,
    pageSize: CUSTOMER_PAGE_SIZE,

    /* Create-customer modal */
    isCreateOpen,
    openCreate,
    closeCreate,
    draft,
    updateDraft,
    fieldErrors,
    submitCreate,
    isCreating: createCustomer.isPending,
  }
}
