/**
 * Menu business rules.
 *
 * Services are the only layer that throws `AppError`. Handlers stay thin (parse, call,
 * respond) and repositories stay dumb (SQL only), so every rule below is stated exactly
 * once and is unit-testable without HTTP.
 */
import type {
  CreateMenuCategoryRequest,
  CreateMenuItemRequest,
  MenuItemListQuery,
  UpdateMenuCategoryRequest,
  UpdateMenuItemRequest,
} from '@odyssey/types'
import { buildPaginationMeta } from '@odyssey/types'

import type { Database } from '../db/client'
import { conflict, notFound } from '../lib/errors'
import {
  toMenuCategory,
  toMenuCategoryWithItems,
  toMenuItem,
} from '../mappers'
import * as repo from '../repositories/menu.repository'

/* -------------------------------- Categories -------------------------------- */

export async function listCategories(db: Database, includeInactive: boolean) {
  const rows = await repo.listCategories(db, { includeInactive })
  return rows.map(toMenuCategory)
}

export async function listCategoriesWithItems(db: Database, includeInactive: boolean) {
  const rows = await repo.listCategoriesWithItems(db, { includeInactive })
  return rows.map(toMenuCategoryWithItems)
}

export async function createCategory(db: Database, input: CreateMenuCategoryRequest) {
  // The database has a unique index on name; checking first lets us return a helpful
  // 409 instead of surfacing a raw constraint violation as a 500.
  const existing = await repo.findCategoryByName(db, input.name)
  if (existing) {
    throw conflict(`A category named '${input.name}' already exists.`, [
      { path: 'name', message: 'must be unique' },
    ])
  }

  return toMenuCategory(await repo.insertCategory(db, input))
}

export async function updateCategory(
  db: Database,
  id: string,
  input: UpdateMenuCategoryRequest,
) {
  if (input.name) {
    const existing = await repo.findCategoryByName(db, input.name)
    if (existing && existing.id !== id) {
      throw conflict(`A category named '${input.name}' already exists.`, [
        { path: 'name', message: 'must be unique' },
      ])
    }
  }

  const row = await repo.updateCategoryById(db, id, input)
  if (!row) throw notFound('Category', id)
  return toMenuCategory(row)
}

/**
 * Deleting a category that still holds items is refused rather than cascaded.
 *
 * The schema enforces this too (`onDelete: 'restrict'`), but catching it here turns a
 * database error into an actionable message. Cascading would silently destroy menu
 * items and, through them, the historical record of what was ordered.
 */
export async function deleteCategory(db: Database, id: string) {
  const category = await repo.findCategoryById(db, id)
  if (!category) throw notFound('Category', id)

  const itemCount = await repo.countItemsInCategory(db, id)
  if (itemCount > 0) {
    throw conflict(
      `'${category.name}' still contains ${itemCount} item${itemCount === 1 ? '' : 's'}. Move or delete them first.`,
      [{ path: 'id', message: 'category is not empty' }],
    )
  }

  await repo.deleteCategoryById(db, id)
}

/* ----------------------------------- Items ---------------------------------- */

export async function listItems(db: Database, query: MenuItemListQuery) {
  const { rows, total } = await repo.listItems(db, query)
  return {
    data: rows.map((row) => ({ ...toMenuItem(row), category: row.category })),
    pagination: buildPaginationMeta(total, query),
  }
}

export async function getItem(db: Database, id: string) {
  const row = await repo.findItemById(db, id)
  if (!row) throw notFound('Menu item', id)
  return toMenuItem(row)
}

export async function createItem(db: Database, input: CreateMenuItemRequest) {
  // Validate the FK ourselves so a bad categoryId is a clear 404 rather than a
  // foreign-key violation surfacing as a 500.
  const category = await repo.findCategoryById(db, input.categoryId)
  if (!category) throw notFound('Category', input.categoryId)

  return toMenuItem(await repo.insertItem(db, input))
}

export async function updateItem(db: Database, id: string, input: UpdateMenuItemRequest) {
  if (input.categoryId) {
    const category = await repo.findCategoryById(db, input.categoryId)
    if (!category) throw notFound('Category', input.categoryId)
  }

  const row = await repo.updateItemById(db, id, input)
  if (!row) throw notFound('Menu item', id)
  return toMenuItem(row)
}

/**
 * An item that has ever been ordered is never hard-deleted.
 *
 * Order items snapshot the name and price, so history would survive the row — but the
 * FK is `restrict` and, more importantly, deleting it would break the ability to report
 * on that item. The correct operation is to mark it unavailable, which removes it from
 * ordering while preserving the record, so that is what the error tells the operator.
 */
export async function deleteItem(db: Database, id: string) {
  const item = await repo.findItemById(db, id)
  if (!item) throw notFound('Menu item', id)

  if (await repo.itemHasOrderHistory(db, id)) {
    throw conflict(
      `'${item.name}' appears on existing orders and cannot be deleted. Mark it unavailable instead to remove it from the menu.`,
      [{ path: 'id', message: 'item has order history' }],
    )
  }

  await repo.deleteItemById(db, id)
}
