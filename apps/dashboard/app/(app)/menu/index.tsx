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
 *
 * This file is layout only — the header, the category list and the three modals. The
 * drafts, validation, mutations and invalidation live in `useMenuManager`.
 */
import { pluralize } from '@odyssey/shared'
import {
  Button,
  Card,
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
  Switch,
  Textarea,
  VStack,
  useTheme,
} from '@odyssey/ui'

import { CategoryCard } from '../../../src/features/menu/CategoryCard'
import { useMenuManager } from '../../../src/features/menu/useMenuManager'
import { MenuIcon, PlusIcon } from '../../../src/components/icons'

export default function MenuScreen() {
  const theme = useTheme()
  const { menu, categoryOptions, itemCount, toggleAvailability, itemForm, categoryForm, deletion } =
    useMenuManager()

  const { data: categories, isPending, isError, error, refetch } = menu
  const { draft, fieldErrors } = itemForm

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
            <Button variant="secondary" onPress={categoryForm.open}>
              Add category
            </Button>
            <Button
              variant="primary"
              onPress={() => itemForm.openCreate()}
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
            <Button variant="primary" onPress={categoryForm.open}>
              Add the first category
            </Button>
          }
        />
      ) : (
        categories.map((category) => (
          <CategoryCard
            key={category.id}
            category={category}
            onAddItem={() => itemForm.openCreate(category.id)}
            onEditItem={itemForm.openEdit}
            onToggleAvailability={toggleAvailability}
            onDeleteItem={deletion.request}
          />
        ))
      )}

      {/* ---------------------------- Item modal ---------------------------- */}
      <Modal
        open={itemForm.isOpen}
        onClose={itemForm.close}
        title={draft.id ? 'Edit item' : 'Add item'}
        description="Prices are stored in whole cents; the server recalculates order totals from them."
        footer={
          <>
            <Button variant="secondary" onPress={itemForm.close}>
              Cancel
            </Button>
            <Button variant="primary" loading={itemForm.isSaving} onPress={() => void itemForm.submit()}>
              {draft.id ? 'Save changes' : 'Add item'}
            </Button>
          </>
        }
      >
        <VStack gap={4}>
          <Field label="Name" required error={fieldErrors.name}>
            <Input
              value={draft.name}
              onChangeText={(name) => itemForm.update({ name })}
              placeholder="e.g. Margherita"
              invalid={Boolean(fieldErrors.name)}
            />
          </Field>

          <Field label="Category" required error={fieldErrors.categoryId}>
            <Select
              value={draft.categoryId}
              onChange={(categoryId) => itemForm.update({ categoryId })}
              options={categoryOptions}
              placeholder="Choose a category"
              invalid={Boolean(fieldErrors.categoryId)}
            />
          </Field>

          <Field label="Price" required error={fieldErrors.priceCents}>
            <MoneyInput
              value={draft.priceCents}
              onChangeValue={(priceCents) => itemForm.update({ priceCents })}
              invalid={Boolean(fieldErrors.priceCents)}
            />
          </Field>

          <Field label="Description" helperText="Shown to staff when building an order.">
            <Textarea
              value={draft.description}
              onChangeText={(description) => itemForm.update({ description })}
              placeholder="Optional"
            />
          </Field>

          <Field label="Prep time" helperText="Minutes. Leave blank to use the restaurant default.">
            <Input
              value={draft.prepTimeMinutes}
              onChangeText={itemForm.setPrepTimeMinutes}
              placeholder="e.g. 15"
              keyboardType="number-pad"
            />
          </Field>

          <Switch
            value={draft.isAvailable}
            onValueChange={(isAvailable) => itemForm.update({ isAvailable })}
            label="Available to order"
            description="Unavailable items are rejected by the API at order time."
          />
        </VStack>
      </Modal>

      {/* -------------------------- Category modal -------------------------- */}
      <Modal
        open={categoryForm.isOpen}
        onClose={categoryForm.close}
        title="Add category"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onPress={categoryForm.close}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={categoryForm.isSaving}
              onPress={() => void categoryForm.submit()}
            >
              Add category
            </Button>
          </>
        }
      >
        <Field label="Name" required error={categoryForm.error}>
          <Input
            value={categoryForm.name}
            invalid={Boolean(categoryForm.error)}
            onChangeText={categoryForm.setName}
            placeholder="e.g. Desserts"
            autoFocus
          />
        </Field>
      </Modal>

      {/* --------------------------- Delete confirm -------------------------- */}
      <Modal
        open={deletion.target !== null}
        onClose={deletion.cancel}
        title={`Delete ${deletion.target?.name ?? 'item'}?`}
        description="Items that appear on existing orders cannot be deleted — mark them unavailable instead."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onPress={deletion.cancel}>
              Keep item
            </Button>
            <Button variant="danger" loading={deletion.isDeleting} onPress={() => void deletion.confirm()}>
              Delete
            </Button>
          </>
        }
      >
      </Modal>
    </VStack>
  )
}
