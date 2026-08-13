/**
 * Menu management.
 *
 * Loads the whole menu in one request (`GET /menu/full`, categories with items nested)
 * rather than fetching items per category — the latter is an N+1 that gets worse as the
 * menu grows, on a backend that opens a database connection per request.
 *
 * The highest-frequency real action on this screen is toggling availability when the
 * kitchen runs out of something mid-service, so that is a single tap on a Switch rather
 * than something buried in an edit modal.
 *
 * Prices are integer cents everywhere. `MoneyInput` takes and emits cents, so a float
 * price cannot enter the system through this form.
 */
import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import {
  ApiClientError,
  getListFullMenuQueryKey,
  useCreateMenuCategory,
  useCreateMenuItem,
  useDeleteMenuItem,
  useListFullMenu,
  useUpdateMenuItem,
} from '@odyssey/api-client'
import type { MenuCategoryWithItems, MenuItem } from '@odyssey/api-client'
import { formatMoney, pluralize } from '@odyssey/shared'
import {
  Badge,
  Button,
  Card,
  DialogBody,
  DialogFooter,
  EmptyState,
  ErrorState,
  Field,
  HStack,
  Input,
  Modal,
  MoneyInput,
  PageHeader,
  Select,
  Skeleton,
  Spacer,
  Switch,
  Text,
  Textarea,
  VStack,
  useTheme,
  useToast,
} from '@odyssey/ui'

import { MenuIcon, PlusIcon } from '../../../src/components/icons'

type ItemDraft = {
  id?: string
  categoryId: string
  name: string
  description: string
  priceCents: number
  isAvailable: boolean
  prepTimeMinutes: string
}

const EMPTY_ITEM: ItemDraft = {
  categoryId: '',
  name: '',
  description: '',
  priceCents: 0,
  isAvailable: true,
  prepTimeMinutes: '',
}

export default function MenuScreen() {
  const theme = useTheme()
  const toast = useToast()
  const queryClient = useQueryClient()

  const { data: categories, isPending, isError, error, refetch } = useListFullMenu()

  const [itemModalOpen, setItemModalOpen] = useState(false)
  const [categoryModalOpen, setCategoryModalOpen] = useState(false)
  const [draft, setDraft] = useState<ItemDraft>(EMPTY_ITEM)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [categoryName, setCategoryName] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<MenuItem | null>(null)

  const createItem = useCreateMenuItem()
  const updateItem = useUpdateMenuItem()
  const deleteItem = useDeleteMenuItem()
  const createCategory = useCreateMenuCategory()

  /** One invalidation target: the whole menu comes from a single query. */
  const refreshMenu = () =>
    queryClient.invalidateQueries({ queryKey: getListFullMenuQueryKey() })

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
  const toggleAvailability = async (item: MenuItem, isAvailable: boolean) => {
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
        caught instanceof ApiClientError ? caught.message : 'Please try again.',
      )
    }
  }

  const openCreateItem = (categoryId?: string) => {
    setDraft({ ...EMPTY_ITEM, categoryId: categoryId ?? categoryOptions[0]?.value ?? '' })
    setFieldErrors({})
    setItemModalOpen(true)
  }

  const openEditItem = (item: MenuItem) => {
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
  }

  const submitItem = async () => {
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
  }

  const submitCategory = async () => {
    if (categoryName.trim().length === 0) return
    try {
      await createCategory.mutateAsync({ data: { name: categoryName.trim(), sortOrder: 0 } })
      await refreshMenu()
      toast.success('Category added', categoryName.trim())
      setCategoryName('')
      setCategoryModalOpen(false)
    } catch (caught) {
      toast.error(
        'Could not add the category',
        caught instanceof ApiClientError ? caught.message : 'Please try again.',
      )
    }
  }

  const confirmDelete = async () => {
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
        caught instanceof ApiClientError ? caught.message : 'Please try again.',
      )
      setDeleteTarget(null)
    }
  }

  if (isError) {
    return (
      <VStack gap={6}>
        <PageHeader title="Menu" />
        <ErrorState title="Could not load the menu" error={error} onRetry={() => void refetch()} />
      </VStack>
    )
  }

  return (
    <VStack gap={5}>
      <PageHeader
        title="Menu"
        description={
          isPending
            ? 'Loading…'
            : `${pluralize(categories.length, 'category', 'categories')} · ${pluralize(itemCount, 'item')}`
        }
        actions={
          <HStack gap={2} wrap>
            <Button variant="secondary" onPress={() => setCategoryModalOpen(true)}>
              Add category
            </Button>
            <Button
              variant="primary"
              onPress={() => openCreateItem()}
              disabled={categoryOptions.length === 0}
              iconLeft={<PlusIcon size={16} color={theme.color.textInverse} />}
            >
              Add item
            </Button>
          </HStack>
        }
      />

      {isPending ? (
        <VStack gap={4}>
          {[0, 1, 2].map((key) => (
            <Card key={key} padding={5}>
              <VStack gap={3}>
                <Skeleton width={180} height={20} />
                <Skeleton width="100%" height={56} />
                <Skeleton width="100%" height={56} />
              </VStack>
            </Card>
          ))}
        </VStack>
      ) : categories.length === 0 ? (
        <EmptyState
          title="No menu yet"
          description="Create a category first, then add items to it."
          icon={<MenuIcon size={24} color={theme.color.textSubtle} />}
          action={
            <Button variant="primary" onPress={() => setCategoryModalOpen(true)}>
              Add the first category
            </Button>
          }
        />
      ) : (
        categories.map((category) => (
          <CategoryCard
            key={category.id}
            category={category}
            onAddItem={() => openCreateItem(category.id)}
            onEditItem={openEditItem}
            onToggleAvailability={toggleAvailability}
            onDeleteItem={setDeleteTarget}
          />
        ))
      )}

      {/* ---------------------------- Item modal ---------------------------- */}
      <Modal
        open={itemModalOpen}
        onClose={() => setItemModalOpen(false)}
        title={draft.id ? 'Edit item' : 'Add item'}
        description="Prices are stored in whole cents; the server recalculates order totals from them."
      >
        <DialogBody>
          <VStack gap={4}>
            <Field label="Name" required error={fieldErrors.name}>
              <Input
                value={draft.name}
                onChangeText={(name) => setDraft((current) => ({ ...current, name }))}
                placeholder="e.g. Margherita"
                invalid={Boolean(fieldErrors.name)}
              />
            </Field>

            <Field label="Category" required error={fieldErrors.categoryId}>
              <Select
                value={draft.categoryId}
                onChange={(categoryId) => setDraft((current) => ({ ...current, categoryId }))}
                options={categoryOptions}
                placeholder="Choose a category"
                invalid={Boolean(fieldErrors.categoryId)}
              />
            </Field>

            <Field label="Price" required error={fieldErrors.priceCents}>
              <MoneyInput
                value={draft.priceCents}
                onChangeValue={(priceCents) => setDraft((current) => ({ ...current, priceCents }))}
                invalid={Boolean(fieldErrors.priceCents)}
              />
            </Field>

            <Field label="Description" helperText="Shown to staff when building an order.">
              <Textarea
                value={draft.description}
                onChangeText={(description) => setDraft((current) => ({ ...current, description }))}
                placeholder="Optional"
              />
            </Field>

            <Field label="Prep time" helperText="Minutes. Leave blank to use the restaurant default.">
              <Input
                value={draft.prepTimeMinutes}
                onChangeText={(prepTimeMinutes) =>
                  setDraft((current) => ({
                    ...current,
                    // Digits only: the API rejects a non-integer and there is no reason
                    // to let the operator type one.
                    prepTimeMinutes: prepTimeMinutes.replace(/[^0-9]/g, ''),
                  }))
                }
                placeholder="e.g. 15"
                keyboardType="number-pad"
              />
            </Field>

            <Switch
              value={draft.isAvailable}
              onValueChange={(isAvailable) => setDraft((current) => ({ ...current, isAvailable }))}
              label="Available to order"
              description="Unavailable items are rejected by the API at order time."
            />
          </VStack>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onPress={() => setItemModalOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={createItem.isPending || updateItem.isPending}
            onPress={() => void submitItem()}
          >
            {draft.id ? 'Save changes' : 'Add item'}
          </Button>
        </DialogFooter>
      </Modal>

      {/* -------------------------- Category modal -------------------------- */}
      <Modal
        open={categoryModalOpen}
        onClose={() => setCategoryModalOpen(false)}
        title="Add category"
        size="sm"
      >
        <DialogBody>
          <Field label="Name" required>
            <Input
              value={categoryName}
              onChangeText={setCategoryName}
              placeholder="e.g. Desserts"
              autoFocus
            />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onPress={() => setCategoryModalOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={createCategory.isPending}
            onPress={() => void submitCategory()}
          >
            Add category
          </Button>
        </DialogFooter>
      </Modal>

      {/* --------------------------- Delete confirm -------------------------- */}
      <Modal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title={`Delete ${deleteTarget?.name ?? 'item'}?`}
        description="Items that appear on existing orders cannot be deleted — mark them unavailable instead."
        size="sm"
      >
        <DialogFooter>
          <Button variant="secondary" onPress={() => setDeleteTarget(null)}>
            Keep item
          </Button>
          <Button variant="danger" loading={deleteItem.isPending} onPress={() => void confirmDelete()}>
            Delete
          </Button>
        </DialogFooter>
      </Modal>
    </VStack>
  )
}

function CategoryCard({
  category,
  onAddItem,
  onEditItem,
  onToggleAvailability,
  onDeleteItem,
}: {
  category: MenuCategoryWithItems
  onAddItem: () => void
  onEditItem: (item: MenuItem) => void
  onToggleAvailability: (item: MenuItem, isAvailable: boolean) => void
  onDeleteItem: (item: MenuItem) => void
}) {
  const theme = useTheme()

  return (
    <Card
      padding={0}
      header={
        <HStack align="center" gap={3}>
          <Text variant="heading">{category.name}</Text>
          <Badge tone="neutral" size="sm" variant="subtle">
            {String(category.items.length)}
          </Badge>
          <Spacer />
          <Button variant="ghost" size="sm" onPress={onAddItem}>
            Add item
          </Button>
        </HStack>
      }
    >
      {category.items.length === 0 ? (
        <VStack padding={5}>
          <Text variant="bodySm" tone="subtle">
            No items in this category yet.
          </Text>
        </VStack>
      ) : (
        category.items.map((item, index) => (
          <HStack
            key={item.id}
            gap={4}
            align="center"
            style={{
              paddingHorizontal: theme.spacing[5],
              paddingVertical: theme.spacing[3],
              borderTopWidth: index === 0 ? 0 : theme.borderWidth.hairline,
              borderTopColor: theme.color.borderSubtle,
            }}
          >
            <VStack gap={0.5} style={{ flex: 1, minWidth: 0 }}>
              <Text variant="bodyMedium" numberOfLines={1}>
                {item.name}
              </Text>
              {item.description ? (
                <Text variant="caption" tone="subtle" numberOfLines={1}>
                  {item.description}
                </Text>
              ) : null}
            </VStack>

            <Text variant="bodySm" numeric weight="600">
              {formatMoney(item.priceCents)}
            </Text>

            <Switch
              value={item.isAvailable}
              onValueChange={(next) => onToggleAvailability(item, next)}
              size="sm"
              accessibilityLabel={`${item.name} available to order`}
            />

            <Button variant="ghost" size="sm" onPress={() => onEditItem(item)}>
              Edit
            </Button>
            <Button variant="ghost" size="sm" onPress={() => onDeleteItem(item)}>
              Delete
            </Button>
          </HStack>
        ))
      )}
    </Card>
  )
}
