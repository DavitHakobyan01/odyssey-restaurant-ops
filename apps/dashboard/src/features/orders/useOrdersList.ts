/**
 * Query concerns for the orders list: filters, sorting, paging and the request itself.
 *
 * Search is debounced, so typing an order number issues one request rather than one per
 * keystroke — each of which would open its own database connection on the Worker.
 *
 * The screen keeps the filter bar, the column definitions and the layout; everything that
 * decides *what is asked of the server* lives here.
 */
import { useMemo, useState } from 'react'
import { keepPreviousData } from '@tanstack/react-query'

import { useListOrders } from '@odyssey/api-client'
import type { ListOrdersParams, ListOrdersSortBy, OrderSummary } from '@odyssey/api-client'
import type { OrderStatus } from '@odyssey/types/domain'

import { useDebouncedValue } from './useDebouncedValue'

export const ORDERS_PAGE_SIZE = 25

export type OrdersListFilters = {
  statuses: OrderStatus[]
  type: string
  /** The raw input value, not the debounced one — it is what the text field displays. */
  searchInput: string
  sortBy: ListOrdersSortBy
  sortDir: 'asc' | 'desc'
}

export function useOrdersList() {
  const [statuses, setStatuses] = useState<OrderStatus[]>([])
  const [type, setType] = useState<string>('')
  const [searchInput, setSearchInput] = useState('')
  const [sortBy, setSortBy] = useState<ListOrdersSortBy>('placedAt')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [offset, setOffset] = useState(0)

  const search = useDebouncedValue(searchInput, 300)

  /**
   * Built as one memoised object so the query key is stable — rebuilding it inline on
   * every render would give React Query a new key each time and refetch continuously.
   *
   * Empty values are omitted rather than sent as empty strings, because the API validates
   * `search` with a minimum length of 1 and would reject `?search=`.
   */
  const params = useMemo<ListOrdersParams>(() => {
    const next: ListOrdersParams = { limit: ORDERS_PAGE_SIZE, offset, sortBy, sortDir }
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
  const onFilterChange =
    <T,>(setter: (value: T) => void) =>
    (value: T) => {
      setter(value)
      setOffset(0)
    }

  const filters: OrdersListFilters = { statuses, type, searchInput, sortBy, sortDir }

  const rows: OrderSummary[] = data?.data ?? []

  return {
    filters,
    hasFilters,
    changeStatuses: onFilterChange(setStatuses),
    changeType: onFilterChange(setType),
    changeSearch: onFilterChange(setSearchInput),
    /** Sorting is server-side, so a new sort is a new query and returns to page one. */
    changeSort: (key: string, direction: 'asc' | 'desc') => {
      setSortBy(key as ListOrdersSortBy)
      setSortDir(direction)
      setOffset(0)
    },
    resetFilters,
    offset,
    setOffset,
    pageSize: ORDERS_PAGE_SIZE,
    rows,
    total: data?.pagination.total ?? 0,
    hasMore: data?.pagination.hasMore ?? false,
    isPending,
    isFetching,
    isError,
    error,
    refetch,
  }
}
