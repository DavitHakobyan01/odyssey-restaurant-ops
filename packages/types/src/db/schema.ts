/**
 * The single source of truth for all persisted data.
 *
 * Everything downstream is derived from this file:
 *   schema.ts -> drizzle-zod -> Hono/OpenAPI -> Orval -> frontend types & hooks
 *
 * Nothing in the frontend or the API layer redeclares these shapes by hand.
 *
 * Money is stored as integer minor units (cents). Floats are never used for money —
 * totals are computed server-side in integer arithmetic and verified against the
 * client's expectation before an order is accepted.
 */
import { relations, sql } from 'drizzle-orm'
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgSequence,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import { ORDER_STATUSES, ORDER_TYPES } from '../domain/order-status'

/* -------------------------------------------------------------------------- */
/*                                   Enums                                     */
/* -------------------------------------------------------------------------- */

/**
 * The Postgres enums are built from the dependency-free tuples in `domain/order-status`.
 *
 * Declaring the values there rather than inline keeps the frontend bundle free of
 * drizzle while still guaranteeing there is exactly one declaration: the Postgres
 * type, the TypeScript union, the zod contracts and the UI labels are all derived
 * from the same tuple, so they cannot drift apart.
 */
export const orderStatusEnum = pgEnum('order_status', ORDER_STATUSES)

export const orderTypeEnum = pgEnum('order_type', ORDER_TYPES)

/* -------------------------------------------------------------------------- */
/*                                 Sequences                                   */
/* -------------------------------------------------------------------------- */

/**
 * Human-facing order numbers (ORD-1001, ORD-1002, ...).
 *
 * Backed by a real Postgres sequence rather than `count(*) + 1` so that concurrent
 * order creation can never collide on the same number.
 */
export const orderNumberSeq = pgSequence('order_number_seq', {
  startWith: 1001,
  increment: 1,
})

/* -------------------------------------------------------------------------- */
/*                                   Tables                                    */
/* -------------------------------------------------------------------------- */

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}

export const menuCategories = pgTable(
  'menu_categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 120 }).notNull(),
    description: text('description'),
    /** Display order on the menu. Lower sorts first. */
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps,
  },
  (table) => [uniqueIndex('menu_categories_name_key').on(table.name)],
)

export const menuItems = pgTable(
  'menu_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => menuCategories.id, { onDelete: 'restrict' }),
    name: varchar('name', { length: 160 }).notNull(),
    description: text('description'),
    /** Integer minor units (cents). Never a float. */
    priceCents: integer('price_cents').notNull(),
    /** Whether the kitchen can currently produce this item. Enforced at order creation. */
    isAvailable: boolean('is_available').notNull().default(true),
    /** Per-item prep estimate; falls back to the restaurant default when null. */
    prepTimeMinutes: integer('prep_time_minutes'),
    imageUrl: text('image_url'),
    ...timestamps,
  },
  (table) => [
    index('menu_items_category_idx').on(table.categoryId),
    index('menu_items_available_idx').on(table.isAvailable),
  ],
)

export const customers = pgTable(
  'customers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 160 }).notNull(),
    email: varchar('email', { length: 254 }).notNull(),
    phone: varchar('phone', { length: 40 }),
    notes: text('notes'),
    ...timestamps,
  },
  (table) => [uniqueIndex('customers_email_key').on(sql`lower(${table.email})`)],
)

export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Human-facing identifier, e.g. ORD-1042. Allocated from `order_number_seq`. */
    orderNumber: varchar('order_number', { length: 24 }).notNull(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),
    status: orderStatusEnum('status').notNull().default('pending'),
    type: orderTypeEnum('type').notNull().default('takeaway'),

    /* All monetary columns are server-computed. The client never writes these. */
    subtotalCents: integer('subtotal_cents').notNull(),
    taxCents: integer('tax_cents').notNull(),
    serviceFeeCents: integer('service_fee_cents').notNull(),
    totalCents: integer('total_cents').notNull(),

    notes: text('notes'),

    /* Lifecycle timestamps, stamped by the state machine on each valid transition. */
    placedAt: timestamp('placed_at', { withTimezone: true }).notNull().defaultNow(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    preparingAt: timestamp('preparing_at', { withTimezone: true }),
    readyAt: timestamp('ready_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancellationReason: text('cancellation_reason'),

    ...timestamps,
  },
  (table) => [
    uniqueIndex('orders_order_number_key').on(table.orderNumber),
    index('orders_status_idx').on(table.status),
    index('orders_customer_idx').on(table.customerId),
    index('orders_placed_at_idx').on(table.placedAt),
  ],
)

export const orderItems = pgTable(
  'order_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    /**
     * Kept as `restrict` on purpose: an item that has been ordered cannot be deleted
     * out from under historical orders.
     */
    menuItemId: uuid('menu_item_id')
      .notNull()
      .references(() => menuItems.id, { onDelete: 'restrict' }),

    /**
     * Name and price are snapshotted at order time. Menu prices change; a historical
     * order must always render the amount the customer was actually charged.
     */
    nameSnapshot: varchar('name_snapshot', { length: 160 }).notNull(),
    unitPriceCents: integer('unit_price_cents').notNull(),
    quantity: integer('quantity').notNull(),
    lineTotalCents: integer('line_total_cents').notNull(),
    notes: text('notes'),

    createdAt: timestamps.createdAt,
  },
  (table) => [
    index('order_items_order_idx').on(table.orderId),
    index('order_items_menu_item_idx').on(table.menuItemId),
  ],
)

/** Shape of the `opening_hours` JSONB column. */
export type OpeningHour = {
  /** 0 = Sunday ... 6 = Saturday */
  dayOfWeek: number
  /** 24h "HH:mm" */
  opensAt: string
  /** 24h "HH:mm" */
  closesAt: string
  isClosed: boolean
}

/**
 * Restaurant-wide ordering settings. Enforced as a single row via `singleton_lock`,
 * so the API can always read "the" settings without ambiguity.
 */
export const restaurantSettings = pgTable(
  'restaurant_settings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Always `true`; the unique index below makes a second row impossible. */
    singletonLock: boolean('singleton_lock').notNull().default(true),

    restaurantName: varchar('restaurant_name', { length: 160 }).notNull(),
    currency: varchar('currency', { length: 3 }).notNull().default('USD'),

    /** Master switch — when false the kitchen rejects all new orders. */
    isAcceptingOrders: boolean('is_accepting_orders').notNull().default(true),
    /** When true, new orders skip `pending` and land directly in `accepted`. */
    autoAcceptOrders: boolean('auto_accept_orders').notNull().default(false),
    defaultPrepTimeMinutes: integer('default_prep_time_minutes').notNull().default(20),

    /** Basis points (1/100th of a percent). 875 = 8.75%. Integer math, no float drift. */
    taxRateBps: integer('tax_rate_bps').notNull().default(875),
    serviceFeeBps: integer('service_fee_bps').notNull().default(0),

    /** Orders below this are rejected at creation. */
    minimumOrderCents: integer('minimum_order_cents').notNull().default(0),

    openingHours: jsonb('opening_hours').$type<OpeningHour[]>().notNull().default([]),

    ...timestamps,
  },
  (table) => [uniqueIndex('restaurant_settings_singleton_key').on(table.singletonLock)],
)

/* -------------------------------------------------------------------------- */
/*                                 Relations                                   */
/* -------------------------------------------------------------------------- */

export const menuCategoriesRelations = relations(menuCategories, ({ many }) => ({
  items: many(menuItems),
}))

export const menuItemsRelations = relations(menuItems, ({ one, many }) => ({
  category: one(menuCategories, {
    fields: [menuItems.categoryId],
    references: [menuCategories.id],
  }),
  orderItems: many(orderItems),
}))

export const customersRelations = relations(customers, ({ many }) => ({
  orders: many(orders),
}))

export const ordersRelations = relations(orders, ({ one, many }) => ({
  customer: one(customers, {
    fields: [orders.customerId],
    references: [customers.id],
  }),
  items: many(orderItems),
}))

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, {
    fields: [orderItems.orderId],
    references: [orders.id],
  }),
  menuItem: one(menuItems, {
    fields: [orderItems.menuItemId],
    references: [menuItems.id],
  }),
}))

/* -------------------------------------------------------------------------- */
/*                          Inferred persistence types                         */
/* -------------------------------------------------------------------------- */

export type MenuCategoryRow = typeof menuCategories.$inferSelect
export type NewMenuCategoryRow = typeof menuCategories.$inferInsert
export type MenuItemRow = typeof menuItems.$inferSelect
export type NewMenuItemRow = typeof menuItems.$inferInsert
export type CustomerRow = typeof customers.$inferSelect
export type NewCustomerRow = typeof customers.$inferInsert
export type OrderRow = typeof orders.$inferSelect
export type NewOrderRow = typeof orders.$inferInsert
export type OrderItemRow = typeof orderItems.$inferSelect
export type NewOrderItemRow = typeof orderItems.$inferInsert
export type RestaurantSettingsRow = typeof restaurantSettings.$inferSelect
export type NewRestaurantSettingsRow = typeof restaurantSettings.$inferInsert
