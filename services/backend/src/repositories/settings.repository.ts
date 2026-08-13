/**
 * Restaurant settings data access.
 *
 * Like every repository here, this layer owns SQL and nothing else — no business rules,
 * no `AppError`, no DTO shaping. It returns Drizzle rows and lets the service decide
 * what they mean.
 *
 * The one thing that *is* modelled here rather than in the service is the singleton
 * itself. `restaurant_settings` carries a `singleton_lock boolean` column with a unique
 * index on it (`restaurant_settings_singleton_key`), so the table can physically hold at
 * most one row. That is a storage-level invariant, not a business rule, which is why
 * enforcing it — and materialising the row on first read — lives at this layer.
 */
import { eq } from 'drizzle-orm'

import { restaurantSettings } from '@odyssey/types/db'
import type { NewRestaurantSettingsRow, RestaurantSettingsRow } from '@odyssey/types/db'

import type { Database } from '../db/client'

/**
 * The row a brand-new database gets on first read.
 *
 * These mirror the column defaults in the Drizzle schema, but are restated explicitly so
 * the INSERT is self-describing: a reviewer can see exactly what a fresh install starts
 * with without cross-referencing the DDL, and a future change to one is a visible diff
 * against the other rather than a silent divergence.
 *
 * `restaurantName` has no column default (it is `notNull` with no `.default()`), so it
 * must be supplied here — it is the only value that would otherwise fail the insert.
 */
const DEFAULT_SETTINGS = {
  restaurantName: 'Odyssey Kitchen',
  currency: 'USD',
  isAcceptingOrders: true,
  autoAcceptOrders: false,
  defaultPrepTimeMinutes: 20,
  // 875 basis points = 8.75%. Basis points keep tax as integer math; see schema.ts.
  taxRateBps: 875,
  serviceFeeBps: 0,
  minimumOrderCents: 0,
  openingHours: [],
} as const satisfies Omit<NewRestaurantSettingsRow, 'id' | 'singletonLock'>

/**
 * Read the settings row, creating it if the table is empty.
 *
 * Contract: this **always** returns a row. Settings are conceptually a document that
 * always exists, so `GET /settings` must never 404 and a freshly migrated database must
 * be immediately usable by the dashboard without a seed step.
 *
 * Why not check-then-insert
 * -------------------------
 * `SELECT` → "no row" → plain `INSERT` is a race: two concurrent first requests (which
 * is exactly what an app boot does — several panels mount at once) both see an empty
 * table and both insert. One of them then dies on the unique index and surfaces as a
 * 500 for no good reason.
 *
 * The insert below is instead conflict-tolerant: `ON CONFLICT (singleton_lock) DO
 * NOTHING` targets the singleton index, so the loser of the race quietly inserts nothing
 * and reads the winner's row on the follow-up SELECT. Correctness does not depend on who
 * gets there first.
 *
 * Why a SELECT runs first
 * -----------------------
 * The fast path is a plain read, because after the very first call the row always exists
 * and this endpoint is on the dashboard's hot path. Postgres implements `ON CONFLICT DO
 * NOTHING` by writing a speculative tuple and then killing it on conflict, so an
 * unconditional insert-per-read would generate a dead tuple (and WAL) on every settings
 * fetch. Leading with the SELECT does **not** reintroduce the race: the insert that
 * follows is still the conflict-tolerant one, so the read is a pure optimisation whose
 * failure mode is "do the safe thing anyway".
 */
export async function getSettings(db: Database): Promise<RestaurantSettingsRow> {
  const existing = await selectSingleton(db)
  if (existing) return existing

  // Empty table (or a concurrent creator we lost to). Insert if we can, ignore if the
  // row appeared underneath us.
  const [inserted] = await db
    .insert(restaurantSettings)
    .values(DEFAULT_SETTINGS)
    .onConflictDoNothing({ target: restaurantSettings.singletonLock })
    .returning()
  if (inserted) return inserted

  // We lost the race; the winner's row is committed by the time DO NOTHING returned.
  const created = await selectSingleton(db)
  if (!created) {
    // Only reachable if something deleted the row between the two statements, which no
    // code path does. Loud failure beats returning a fabricated default.
    throw new Error('restaurant_settings row disappeared during get-or-create')
  }
  return created
}

/**
 * Apply a partial patch to the singleton and return the updated row.
 *
 * `values` is a `Partial`, and Drizzle emits a SET clause containing only the keys
 * present on the object — so an unspecified field keeps its stored value rather than
 * being reset. The caller is responsible for not putting `undefined` placeholders in it.
 *
 * `updatedAt` is stamped here rather than by the caller, matching every other repository
 * in the service: it is a storage concern, and doing it in one place means no write path
 * can forget it.
 *
 * The `WHERE` targets `singleton_lock = true` rather than an id, because the row's
 * identity *is* being the singleton — the caller never needs to know its uuid.
 */
export async function updateSettings(
  db: Database,
  values: Partial<NewRestaurantSettingsRow>,
): Promise<RestaurantSettingsRow> {
  // Guarantees the row exists so a PATCH against a fresh database patches the defaults
  // instead of updating zero rows. Same reasoning as getSettings: settings always exist.
  await getSettings(db)

  const [row] = await db
    .update(restaurantSettings)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(restaurantSettings.singletonLock, true))
    .returning()

  if (!row) throw new Error('restaurant_settings row disappeared during update')
  return row
}

/**
 * `LIMIT 1` is belt-and-braces — the unique index already caps the table at one row —
 * but it keeps the plan honest and makes the destructure below obviously safe.
 */
async function selectSingleton(db: Database): Promise<RestaurantSettingsRow | undefined> {
  const [row] = await db
    .select()
    .from(restaurantSettings)
    .where(eq(restaurantSettings.singletonLock, true))
    .limit(1)
  return row
}
