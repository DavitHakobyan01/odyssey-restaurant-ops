/**
 * Home dashboard KPI contracts.
 *
 * Every figure here is aggregated in SQL. The dashboard renders what it is given and
 * performs no arithmetic of its own — revenue in particular must never be summed in the
 * client, where a page of results would silently produce a wrong number.
 */
import { z } from 'zod'

import { ORDER_STATUSES } from '../domain/order-status'
import { isoDateTime, uuidSchema } from './common'

export const STATS_RANGES = ['today', '7d', '30d', 'all'] as const

export type StatsRange = (typeof STATS_RANGES)[number]

export const statsQuerySchema = z.object({
  range: z.enum(STATS_RANGES).default('today'),
})

export type StatsQuery = z.infer<typeof statsQuerySchema>

export const popularMenuItemSchema = z.object({
  menuItemId: uuidSchema,
  name: z.string(),
  /** Units sold across non-cancelled orders in range. */
  quantitySold: z.number().int().min(0),
  revenueCents: z.number().int().min(0),
})

export type PopularMenuItem = z.infer<typeof popularMenuItemSchema>

export const ordersByStatusSchema = z.object({
  status: z.enum(ORDER_STATUSES),
  count: z.number().int().min(0),
})

export type OrdersByStatus = z.infer<typeof ordersByStatusSchema>

export const revenuePointSchema = z.object({
  /** Bucket start, ISO-8601. Daily buckets for 7d/30d, hourly for today. */
  bucket: isoDateTime,
  revenueCents: z.number().int().min(0),
  orderCount: z.number().int().min(0),
})

export type RevenuePoint = z.infer<typeof revenuePointSchema>

export const dashboardOverviewSchema = z.object({
  range: z.enum(STATS_RANGES),
  /** Non-cancelled orders placed in range. */
  totalOrders: z.number().int().min(0),
  /** Sum of totals for non-cancelled orders in range. */
  revenueCents: z.number().int().min(0),
  /** Live count of orders awaiting a decision — not scoped to the range. */
  pendingOrders: z.number().int().min(0),
  /** Live count of orders currently in the kitchen. */
  inProgressOrders: z.number().int().min(0),
  averageOrderValueCents: z.number().int().min(0),
  ordersByStatus: z.array(ordersByStatusSchema),
  popularItems: z.array(popularMenuItemSchema),
  revenueTrend: z.array(revenuePointSchema),
})

export type DashboardOverview = z.infer<typeof dashboardOverviewSchema>
