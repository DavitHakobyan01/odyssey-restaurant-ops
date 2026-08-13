/**
 * Menu data access.
 *
 * Repositories own SQL and nothing else — no business rules, no HTTP, no DTO shaping.
 * They return Drizzle rows. Services decide what those rows mean, and mappers turn them
 * into contract DTOs. Keeping the layers apart is what lets the order service be tested
 * against an in-memory fake of this interface without a database.
 */
import { and, asc, count, eq, ilike, inArray, sql } from 'drizzle-orm'

import type { MenuItemListQuery } from '@odyssey/types'
import { menuCategories, menuItems } from '@odyssey/types/db'
import type {
  MenuCategoryRow,
  MenuItemRow,
  NewMenuCategoryRow,
  NewMenuItemRow,
} from '@odyssey/types/db'

import type { Database } from '../db/client'

/* -------------------------------- Categories -------------------------------- */

export async function listCategories(
  db: Database,
  options: { includeInactive?: boolean } = {},
): Promise<MenuCategoryRow[]> {
  return db
    .select()
    .from(menuCategories)
    .where(options.includeInactive ? undefined : eq(menuCategories.isActive, true))
    .orderBy(asc(menuCategories.sortOrder), asc(menuCategories.name))
}

/**
 * Categories with their items nested — one round trip for the whole Menu page.
 *
 * Uses Drizzle's relational query API rather than a manual join + regroup, so the
 * nesting is type-safe and the N+1 that a naive implementation would introduce is
 * structurally impossible.
 */
export async function listCategoriesWithItems(
  db: Database,
  options: { includeInactive?: boolean } = {},
): Promise<(MenuCategoryRow & { items: MenuItemRow[] })[]> {
  return db.query.menuCategories.findMany({
    where: options.includeInactive ? undefined : eq(menuCategories.isActive, true),
    orderBy: [asc(menuCategories.sortOrder), asc(menuCategories.name)],
    with: {
      items: {
        orderBy: [asc(menuItems.name)],
      },
    },
  })
}

export async function findCategoryById(
  db: Database,
  id: string,
): Promise<MenuCategoryRow | undefined> {
  const [row] = await db.select().from(menuCategories).where(eq(menuCategories.id, id)).limit(1)
  return row
}

export async function findCategoryByName(
  db: Database,
  name: string,
): Promise<MenuCategoryRow | undefined> {
  const [row] = await db.select().from(menuCategories).where(eq(menuCategories.name, name)).limit(1)
  return row
}

export async function insertCategory(
  db: Database,
  values: NewMenuCategoryRow,
): Promise<MenuCategoryRow> {
  const [row] = await db.insert(menuCategories).values(values).returning()
  if (!row) throw new Error('Insert returned no row')
  return row
}

export async function updateCategoryById(
  db: Database,
  id: string,
  values: Partial<NewMenuCategoryRow>,
): Promise<MenuCategoryRow | undefined> {
  const [row] = await db
    .update(menuCategories)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(menuCategories.id, id))
    .returning()
  return row
}

export async function deleteCategoryById(db: Database, id: string): Promise<boolean> {
  const rows = await db.delete(menuCategories).where(eq(menuCategories.id, id)).returning()
  return rows.length > 0
}

/** Whether any item still references this category — checked before allowing a delete. */
export async function countItemsInCategory(db: Database, categoryId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(menuItems)
    .where(eq(menuItems.categoryId, categoryId))
  return row?.value ?? 0
}

/* ----------------------------------- Items ---------------------------------- */

function buildItemFilters(query: MenuItemListQuery) {
  const filters = []
  if (query.categoryId) filters.push(eq(menuItems.categoryId, query.categoryId))
  if (query.isAvailable !== undefined) filters.push(eq(menuItems.isAvailable, query.isAvailable))
  // ilike gives case-insensitive matching without lowering the column, which would
  // prevent the index from being used.
  if (query.search) filters.push(ilike(menuItems.name, `%${query.search}%`))
  return filters.length > 0 ? and(...filters) : undefined
}

export async function listItems(
  db: Database,
  query: MenuItemListQuery,
): Promise<{ rows: (MenuItemRow & { category: { id: string; name: string } })[]; total: number }> {
  const where = buildItemFilters(query)

  // Page and count run concurrently — they are independent reads.
  const [rows, totalResult] = await Promise.all([
    db
      .select({
        id: menuItems.id,
        categoryId: menuItems.categoryId,
        name: menuItems.name,
        description: menuItems.description,
        priceCents: menuItems.priceCents,
        isAvailable: menuItems.isAvailable,
        prepTimeMinutes: menuItems.prepTimeMinutes,
        imageUrl: menuItems.imageUrl,
        createdAt: menuItems.createdAt,
        updatedAt: menuItems.updatedAt,
        category: { id: menuCategories.id, name: menuCategories.name },
      })
      .from(menuItems)
      .innerJoin(menuCategories, eq(menuItems.categoryId, menuCategories.id))
      .where(where)
      .orderBy(asc(menuCategories.sortOrder), asc(menuItems.name))
      .limit(query.limit)
      .offset(query.offset),
    db.select({ value: count() }).from(menuItems).where(where),
  ])

  return { rows, total: totalResult[0]?.value ?? 0 }
}

export async function findItemById(db: Database, id: string): Promise<MenuItemRow | undefined> {
  const [row] = await db.select().from(menuItems).where(eq(menuItems.id, id)).limit(1)
  return row
}

/**
 * Bulk lookup used when pricing an order.
 *
 * One query for every line rather than one per line — an order with 20 items must not
 * become 20 round trips on a per-request database connection.
 */
export async function findItemsByIds(db: Database, ids: string[]): Promise<MenuItemRow[]> {
  if (ids.length === 0) return []
  return db.select().from(menuItems).where(inArray(menuItems.id, ids))
}

export async function insertItem(db: Database, values: NewMenuItemRow): Promise<MenuItemRow> {
  const [row] = await db.insert(menuItems).values(values).returning()
  if (!row) throw new Error('Insert returned no row')
  return row
}

export async function updateItemById(
  db: Database,
  id: string,
  values: Partial<NewMenuItemRow>,
): Promise<MenuItemRow | undefined> {
  const [row] = await db
    .update(menuItems)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(menuItems.id, id))
    .returning()
  return row
}

export async function deleteItemById(db: Database, id: string): Promise<boolean> {
  const rows = await db.delete(menuItems).where(eq(menuItems.id, id)).returning()
  return rows.length > 0
}

/** True when the item has ever appeared on an order — blocks hard delete. */
export async function itemHasOrderHistory(db: Database, id: string): Promise<boolean> {
  const [row] = await db.execute<{ exists: boolean }>(
    sql`select exists(select 1 from order_items where menu_item_id = ${id}) as "exists"`,
  )
  return row?.exists ?? false
}
