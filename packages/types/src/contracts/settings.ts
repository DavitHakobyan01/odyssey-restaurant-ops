/**
 * Ordering settings contracts.
 *
 * These values are not decoration — they are read by the order service on every create:
 * `isAcceptingOrders` gates order intake, `autoAcceptOrders` decides the initial status,
 * `taxRateBps` / `serviceFeeBps` drive server-side pricing, and `minimumOrderCents`
 * rejects undersized orders.
 */
import { createSelectSchema } from 'drizzle-zod'
import { z } from 'zod'

import { restaurantSettings } from '../db/schema'
import { isoDateTime } from './common'

/** 24-hour "HH:mm". */
const timeOfDaySchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour HH:mm format')

export const openingHourSchema = z
  .object({
    /** 0 = Sunday ... 6 = Saturday */
    dayOfWeek: z.number().int().min(0).max(6),
    opensAt: timeOfDaySchema,
    closesAt: timeOfDaySchema,
    isClosed: z.boolean(),
  })
  .refine((value) => value.isClosed || value.opensAt < value.closesAt, {
    message: 'Opening time must be before closing time',
    path: ['closesAt'],
  })

export type OpeningHour = z.infer<typeof openingHourSchema>

export const restaurantSettingsSchema = createSelectSchema(restaurantSettings, {
  openingHours: z.array(openingHourSchema),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
}).omit({ singletonLock: true })

export type RestaurantSettings = z.infer<typeof restaurantSettingsSchema>

/**
 * Settings are edited as a partial patch. `id` and timestamps are server-owned, and
 * `singletonLock` is an implementation detail that never reaches the API.
 */
export const updateSettingsRequestSchema = z
  .object({
    restaurantName: z.string().trim().min(1).max(160),
    currency: z.string().length(3).toUpperCase(),
    isAcceptingOrders: z.boolean(),
    autoAcceptOrders: z.boolean(),
    defaultPrepTimeMinutes: z.number().int().min(1).max(240),
    // Basis points: 875 = 8.75%. Capped at 100% to make a typo'd 8750 fail loudly.
    taxRateBps: z.number().int().min(0).max(10_000),
    serviceFeeBps: z.number().int().min(0).max(10_000),
    minimumOrderCents: z.number().int().min(0),
    openingHours: z.array(openingHourSchema).max(7),
  })
  .partial()

export type UpdateSettingsRequest = z.infer<typeof updateSettingsRequestSchema>
