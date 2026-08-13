/**
 * Menu management state and writes.
 *
 * The Menu route is layout — a header, a list of category cards and three modals. All of
 * the behaviour sitting behind them lives here: the item draft, the client-side
 * validation, the four mutations, the binding of server field errors onto inputs, and the
 * cache invalidation each write owes its dependents. Keeping it in one hook means the
 * route reads as composition, and there is a single place to look for "what happens when
 * the operator saves an item".
 */
import { useCallback, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import {
  ApiClientError,
  useCreateMenuCategory,
  useCreateMenuItem,
  useDeleteMenuItem,
  useListFullMenu,
  useUpdateMenuItem,
} from '@odyssey/api-client'
import type { MenuItem } from '@odyssey/api-client'
import { useToast } from '@odyssey/ui'

import { invalidateMenuDependents } from '../../lib/cache'
import { describeError } from '../../lib/errors'

/**
 * The item modal's working copy.
 *
 * `priceCents` is integer cents, matching the API and `MoneyInput`, so a float price
 * cannot enter the system through this form. `prepTimeMinutes` is the one field held as a
 * string: the control is a text input and an empty string is a meaningful value ("use the
 * restaurant default"), which `number | null` cannot represent while the operator is
 * mid-edit.
 */
export type ItemDraft = {
  id?: string
  categoryId: string
  name: string
  description: string
  priceCents: number
  isAvailable: boolean
  prepTimeMinutes: string
}

export const EMPTY_ITEM: ItemDraft = {
  categoryId: '',
  name: '',
  description: '',
  priceCents: 0,
  isAvailable: true,
  prepTimeMinutes: '',
}

export function useMenuManager() {
  const toast = useToast()
  const queryClient = useQueryClient()

  /**
   * The whole menu in one request (categories with items nested) rather than fetching
   * items per category — the latter is an N+1 that gets worse as the menu grows, on a
   * backend that opens a database connection per request.
   *
   * Returned whole so the route keeps React Query's discriminated union and can narrow
   * `data` off `isPending` / `isError`.
   */
  const menu = useListFullMenu()
  const categories = menu.data

  const createItem = useCreateMenuItem()
  const updateItem = useUpdateMenuItem()
  const deleteItem = useDeleteMenuItem()
  const createCategory = useCreateMenuCategory()

  const [itemModalOpen, setItemModalOpen] = useState(false)
  const [draft, setDraft] = useState<ItemDraft>(EMPTY_ITEM)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [categoryModalOpen, setCategoryModalOpen] = useState(false)
  const [categoryName, setCategoryName] = useState('')
  const [categoryError, setCategoryError] = useState<string | undefined>()
  const [deleteTarget, setDeleteTarget] = useState<MenuItem | null>(null)

  /**
   * `/menu/full` powers this screen, but `/menu/items` is a separate cache that the
   * create-order modal reads. Invalidating only the first left the order form offering an
   * item this screen had just marked unavailable. See lib/cache.ts.
   */
  const refreshMenu = useCallback(() => invalidateMenuDependents(queryClient), [queryClient])

  const categoryOptions = useMemo(
    () => (categories ?? []).map((category) => ({ label: category.name, value: category.id })),
    [categories],
  )

  const itemCount = useMemo(
    () => (categories ?? []).reduce((sum, category) => sum + category.items.length, 0),
    [categories],
  )

  /**
   * Availability toggle.
   *
   * Not optimistic on purpose: an item that visually flips back a second later because
   * the server refused is more confusing during service than a brief moment of latency.
   */
  const toggleAvailability = useCallback(
    async (item: MenuItem, isAvailable: boolean) => {
      try {
        await updateItem.mutateAsync({ id: item.id, data: { isAvailable } })
        await refreshMenu()
        toast.success(
          isAvailable ? `${item.name} is back on` : `${item.name} marked unavailable`,
          isAvailable ? undefined : 'New orders can no longer include it.',
        )
      } catch (caught) {
        toast.error(
          'Could not update availability',
          describeError(caught),
        )
      }
    },
    [refreshMenu, toast, updateItem],
  )

  /* ------------------------------- Item modal ------------------------------- */

  const openCreateItem = useCallback(
    (categoryId?: string) => {
      setDraft({ ...EMPTY_ITEM, categoryId: categoryId ?? categoryOptions[0]?.value ?? '' })
      setFieldErrors({})
      setItemModalOpen(true)
    },
    [categoryOptions],
  )

  const openEditItem = useCallback((item: MenuItem) => {
    setDraft({
      id: item.id,
      categoryId: item.categoryId,
      name: item.name,
      description: item.description ?? '',
      priceCents: item.priceCents,
      isAvailable: item.isAvailable,
      prepTimeMinutes: item.prepTimeMinutes === null ? '' : String(item.prepTimeMinutes),
    })
    setFieldErrors({})
    setItemModalOpen(true)
  }, [])

  const closeItemModal = useCallback(() => setItemModalOpen(false), [])

  const updateDraft = useCallback((patch: Partial<ItemDraft>) => {
    setDraft((current) => ({ ...current, ...patch }))
  }, [])

  const setPrepTimeMinutes = useCallback((prepTimeMinutes: string) => {
    setDraft((current) => ({
      ...current,
      // Digits only: the API rejects a non-integer and there is no reason
      // to let the operator type one.
      prepTimeMinutes: prepTimeMinutes.replace(/[^0-9]/g, ''),
    }))
  }, [])

  const submitItem = useCallback(async () => {
    const errors: Record<string, string> = {}
    if (draft.name.trim().length === 0) errors.name = 'Name is required.'
    if (!draft.categoryId) errors.categoryId = 'Choose a category.'
    if (draft.priceCents < 0) errors.priceCents = 'Price cannot be negative.'
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }

    const payload = {
      categoryId: draft.categoryId,
      name: draft.name.trim(),
      description: draft.description.trim() === '' ? null : draft.description.trim(),
      priceCents: draft.priceCents,
      isAvailable: draft.isAvailable,
      prepTimeMinutes: draft.prepTimeMinutes === '' ? null : Number(draft.prepTimeMinutes),
    }

    try {
      if (draft.id) {
        await updateItem.mutateAsync({ id: draft.id, data: payload })
        toast.success('Item updated', draft.name)
      } else {
        await createItem.mutateAsync({ data: payload })
        toast.success('Item added', draft.name)
      }
      await refreshMenu()
      setItemModalOpen(false)
    } catch (caught) {
      if (caught instanceof ApiClientError) {
        // The backend returns field-level detail for validation failures; bind it to the
        // inputs rather than dumping a sentence at the top of the form.
        setFieldErrors(caught.fieldErrors)
        toast.error('Could not save the item', caught.message)
      } else {
        toast.error('Could not save the item', 'Please try again.')
      }
    }
  }, [createItem, draft, refreshMenu, toast, updateItem])

  /* ----------------------------- Category modal ----------------------------- */

  const openCategoryModal = useCallback(() => setCategoryModalOpen(true), [])
  const closeCategoryModal = useCallback(() => setCategoryModalOpen(false), [])

  const changeCategoryName = useCallback(
    (value: string) => {
      setCategoryName(value)
      // Clear the error as soon as the operator starts correcting it, rather than
      // leaving a stale message under a field that is now valid.
      if (categoryError) setCategoryError(undefined)
    },
    [categoryError],
  )

  const submitCategory = useCallback(async () => {
    // Previously a bare return: pressing Add with a blank name did nothing at all — no
    // error, no toast, no field message — so the button read as broken.
    if (categoryName.trim().length === 0) {
      setCategoryError('Name is required.')
      return
    }
    setCategoryError(undefined)
    try {
      await createCategory.mutateAsync({ data: { name: categoryName.trim(), sortOrder: 0 } })
      await refreshMenu()
      toast.success('Category added', categoryName.trim())
      setCategoryName('')
      setCategoryModalOpen(false)
    } catch (caught) {
      toast.error(
        'Could not add the category',
        describeError(caught),
      )
    }
  }, [categoryName, createCategory, refreshMenu, toast])

  /* ------------------------------ Delete confirm ----------------------------- */

  const requestDelete = useCallback((item: MenuItem) => setDeleteTarget(item), [])
  const cancelDelete = useCallback(() => setDeleteTarget(null), [])

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return
    try {
      await deleteItem.mutateAsync({ id: deleteTarget.id })
      await refreshMenu()
      toast.success('Item deleted', deleteTarget.name)
      setDeleteTarget(null)
    } catch (caught) {
      // The API refuses (409) to delete an item that appears on existing orders, and its
      // message already explains the correct alternative. Surface it verbatim.
      toast.error(
        'Could not delete this item',
        describeError(caught),
      )
      setDeleteTarget(null)
    }
  }, [deleteItem, deleteTarget, refreshMenu, toast])

  return {
    menu,
    categoryOptions,
    itemCount,
    toggleAvailability,

    itemForm: {
      isOpen: itemModalOpen,
      draft,
      fieldErrors,
      isSaving: createItem.isPending || updateItem.isPending,
      openCreate: openCreateItem,
      openEdit: openEditItem,
      close: closeItemModal,
      update: updateDraft,
      setPrepTimeMinutes,
      submit: submitItem,
    },

    categoryForm: {
      isOpen: categoryModalOpen,
      name: categoryName,
      error: categoryError,
      isSaving: createCategory.isPending,
      open: openCategoryModal,
      close: closeCategoryModal,
      setName: changeCategoryName,
      submit: submitCategory,
    },

    deletion: {
      target: deleteTarget,
      isDeleting: deleteItem.isPending,
      request: requestDelete,
      cancel: cancelDelete,
      confirm: confirmDelete,
    },
  }
}
