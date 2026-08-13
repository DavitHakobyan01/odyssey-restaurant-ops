/**
 * Menu contracts.
 *
 * Every schema here is derived from the Drizzle tables via drizzle-zod. Column types,
 * lengths and nullability come from the database definition automatically — the only
 * things written by hand are the extra business rules the database cannot express
 * (a price may not be negative, a name may not be blank).
 */
import { createInsertSchema, createSelectSchema } from 'drizzle-zod'
import { z } from 'zod'

import { menuCategories, menuItems } from '../db/schema'
import { isoDateTime, paginationQuerySchema, uuidSchema } from './common'

/* -------------------------------------------------------------------------- */
/*                                 Categories                                  */
/* -------------------------------------------------------------------------- */

export const menuCategorySchema = createSelectSchema(menuCategories, {
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
})

export type MenuCategory = z.infer<typeof menuCategorySchema>

export const createMenuCategoryRequestSchema = createInsertSchema(menuCategories, {
  name: (schema) => schema.trim().min(1, 'Name is required').max(120),
  sortOrder: (schema) => schema.min(0),
}).omit({ id: true, createdAt: true, updatedAt: true })

export type CreateMenuCategoryRequest = z.infer<typeof createMenuCategoryRequestSchema>

export const updateMenuCategoryRequestSchema = createMenuCategoryRequestSchema.partial()

export type UpdateMenuCategoryRequest = z.infer<typeof updateMenuCategoryRequestSchema>

/* -------------------------------------------------------------------------- */
/*                                    Items                                    */
/* -------------------------------------------------------------------------- */

export const menuItemSchema = createSelectSchema(menuItems, {
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
})

export type MenuItem = z.infer<typeof menuItemSchema>

export const createMenuItemRequestSchema = createInsertSchema(menuItems, {
  name: (schema) => schema.trim().min(1, 'Name is required').max(160),
  // A negative price is representable in an int4 column but is never valid.
  priceCents: (schema) => schema.min(0, 'Price cannot be negative'),
  prepTimeMinutes: (schema) => schema.min(0).max(600).nullable(),
  imageUrl: () => z.url().nullable().optional(),
}).omit({ id: true, createdAt: true, updatedAt: true })

export type CreateMenuItemRequest = z.infer<typeof createMenuItemRequestSchema>

export const updateMenuItemRequestSchema = createMenuItemRequestSchema.partial()

export type UpdateMenuItemRequest = z.infer<typeof updateMenuItemRequestSchema>

/* -------------------------------------------------------------------------- */
/*                              Composite reads                                */
/* -------------------------------------------------------------------------- */

/** An item with its parent category inlined — what the Menu table renders. */
export const menuItemWithCategorySchema = menuItemSchema.extend({
  category: menuCategorySchema.pick({ id: true, name: true }),
})

export type MenuItemWithCategory = z.infer<typeof menuItemWithCategorySchema>

/** A category with its items nested — what the Menu page loads in one request. */
export const menuCategoryWithItemsSchema = menuCategorySchema.extend({
  items: z.array(menuItemSchema),
})

export type MenuCategoryWithItems = z.infer<typeof menuCategoryWithItemsSchema>

/* -------------------------------------------------------------------------- */
/*                                   Queries                                   */
/* -------------------------------------------------------------------------- */

export const menuItemListQuerySchema = paginationQuerySchema.extend({
  categoryId: uuidSchema.optional(),
  /** Filter by kitchen availability. Omit for "any". */
  isAvailable: z.stringbool().optional(),
  /** Case-insensitive match against item name. */
  search: z.string().trim().min(1).max(120).optional(),
})

export type MenuItemListQuery = z.infer<typeof menuItemListQuerySchema>
