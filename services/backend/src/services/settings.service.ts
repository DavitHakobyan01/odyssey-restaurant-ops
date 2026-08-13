/**
 * Restaurant settings business rules.
 *
 * These values are not cosmetic: the order service reads `isAcceptingOrders` to gate
 * intake, `autoAcceptOrders` to pick an order's initial status, `taxRateBps` /
 * `serviceFeeBps` to price every order server-side, and `minimumOrderCents` to reject
 * undersized ones. A bad write here silently changes what customers are charged, which
 * is why the patch path is deliberately narrow and validated rather than a passthrough.
 *
 * As everywhere in this service, this layer is the only one that throws `AppError`, and
 * it never touches HTTP or SQL.
 */
import type { OpeningHour, UpdateSettingsRequest } from '@odyssey/types'
import type { NewRestaurantSettingsRow } from '@odyssey/types/db'

import type { Database } from '../db/client'
import { validationFailed } from '../lib/errors'
import { toRestaurantSettings } from '../mappers'
import * as repo from '../repositories/settings.repository'

/** 0 = Sunday … 6 = Saturday, matching `openingHourSchema.dayOfWeek`. */
const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const

/**
 * Settings always exist — the repository creates the default row on first read — so this
 * has no not-found branch and the route declares no 404.
 */
export async function getSettings(db: Database) {
  return toRestaurantSettings(await repo.getSettings(db))
}

/**
 * Apply a partial settings patch.
 *
 * Two rules are enforced before the write:
 *
 *  1. **Only provided keys are applied.** `updateSettingsRequestSchema` is fully
 *     partial, so a client that sends `{ isAcceptingOrders: false }` must not have its
 *     tax rate silently reset. `toSettingsPatch` builds the SET clause key by key from
 *     values that are actually present, so an absent field cannot reach SQL at all.
 *  2. **`openingHours` may not repeat a `dayOfWeek`.** See `assertUniqueDays`.
 *
 * `updatedAt` is stamped by the repository, and `toRestaurantSettings` strips
 * `singletonLock` so the storage-level singleton marker never appears in a response.
 */
export async function updateSettings(db: Database, input: UpdateSettingsRequest) {
  if (input.openingHours) assertUniqueDays(input.openingHours)

  return toRestaurantSettings(await repo.updateSettings(db, toSettingsPatch(input)))
}

/**
 * Project the validated request onto the columns it is allowed to touch.
 *
 * This is written as an explicit key-by-key copy rather than a spread for two reasons:
 *
 *  - It is a structural whitelist. `id` and `singletonLock` are server-owned identity —
 *    changing either would either orphan the row or break the singleton index — and
 *    neither can slip into the SET clause here even if the request schema were later
 *    widened by mistake. A spread would happily forward whatever arrived.
 *  - It drops `undefined`. zod omits absent optional keys, but an explicitly-sent
 *    `"restaurantName": null`-style shape or a future `.default(undefined)` would leave
 *    a present-but-undefined key that Drizzle would translate into `SET column = NULL`
 *    against a NOT NULL column. Guarding here means "not sent" and "sent as undefined"
 *    behave identically: leave the stored value alone.
 */
function toSettingsPatch(input: UpdateSettingsRequest): Partial<NewRestaurantSettingsRow> {
  const patch: Partial<NewRestaurantSettingsRow> = {}

  if (input.restaurantName !== undefined) patch.restaurantName = input.restaurantName
  if (input.currency !== undefined) patch.currency = input.currency
  if (input.isAcceptingOrders !== undefined) patch.isAcceptingOrders = input.isAcceptingOrders
  if (input.autoAcceptOrders !== undefined) patch.autoAcceptOrders = input.autoAcceptOrders
  if (input.defaultPrepTimeMinutes !== undefined) {
    patch.defaultPrepTimeMinutes = input.defaultPrepTimeMinutes
  }
  if (input.taxRateBps !== undefined) patch.taxRateBps = input.taxRateBps
  if (input.serviceFeeBps !== undefined) patch.serviceFeeBps = input.serviceFeeBps
  if (input.minimumOrderCents !== undefined) patch.minimumOrderCents = input.minimumOrderCents
  if (input.openingHours !== undefined) patch.openingHours = input.openingHours

  return patch
}

/**
 * Reject an opening-hours array that lists the same weekday twice.
 *
 * `openingHours` is a jsonb column holding one entry per day, and the whole array is
 * replaced on write. Two entries for the same `dayOfWeek` have no defined meaning — is
 * the restaurant open for both windows, or does the last one win? — and every consumer
 * (the dashboard's weekly grid, any future "are we open now?" check) would have to
 * invent an answer. Refusing the input is the only behaviour that keeps them agreeing.
 *
 * This lives here rather than in the contract because zod validates each element
 * independently; a cross-element uniqueness constraint is not expressible in the schema
 * that generates the OpenAPI document. It is a 400 (`VALIDATION_ERROR`) rather than a
 * 422 because the request is malformed, not merely disallowed by a business rule — see
 * the status conventions in lib/errors.ts.
 */
function assertUniqueDays(hours: OpeningHour[]): void {
  const firstIndexByDay = new Map<number, number>()
  const duplicates: { path: string; message: string }[] = []

  hours.forEach((hour, index) => {
    const firstIndex = firstIndexByDay.get(hour.dayOfWeek)
    if (firstIndex === undefined) {
      firstIndexByDay.set(hour.dayOfWeek, index)
      return
    }
    // Report the later entry: the first occurrence is the one the client can keep.
    duplicates.push({
      path: `openingHours.${index}.dayOfWeek`,
      message: `${dayName(hour.dayOfWeek)} is already defined at openingHours.${firstIndex}`,
    })
  })

  if (duplicates.length > 0) {
    throw validationFailed(
      'Opening hours may list each day of the week at most once.',
      duplicates,
    )
  }
}

/**
 * `noUncheckedIndexedAccess` makes the lookup `string | undefined`. zod already bounds
 * `dayOfWeek` to 0–6 so the fallback is unreachable, but printing the raw number is a
 * better failure than a non-null assertion that could crash on a hand-edited row.
 */
function dayName(dayOfWeek: number): string {
  return DAY_NAMES[dayOfWeek] ?? `day ${dayOfWeek}`
}
