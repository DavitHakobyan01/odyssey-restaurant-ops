/**
 * The Settings form engine.
 *
 * Two deliberate translations happen here:
 *
 *  - **Basis points are never shown raw.** The API stores `taxRateBps: 875`; the operator
 *    sees and edits `8.75%`. Showing a bps integer would be leaking a storage decision
 *    into the interface.
 *  - **Money is edited in cents.** `MoneyInput` takes and emits integer cents, so the
 *    minimum-order field cannot introduce a float.
 *
 * The form submits only fields that actually changed, matching the API's partial PATCH.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import {
  getGetSettingsQueryKey,
  useGetSettings,
  useUpdateSettings,
} from '@odyssey/api-client'
import type { RestaurantSettings, UpdateSettingsRequest } from '@odyssey/api-client'
import { calculateOrderTotals } from '@odyssey/types/domain'
import { useToast } from '@odyssey/ui'

import { describeError } from '../../lib/errors'

/** A worked example makes an abstract rate concrete. $40.00 is a plausible order. */
const EXAMPLE_SUBTOTAL_CENTS = 4000

export type Draft = {
  restaurantName: string
  isAcceptingOrders: boolean
  autoAcceptOrders: boolean
  defaultPrepTimeMinutes: string
  /** Held as a percentage string while editing; converted to bps on submit. */
  taxRatePercent: string
  serviceFeePercent: string
  minimumOrderCents: number
  /**
   * Always seven entries, indexed by weekday, even when the server stored fewer.
   *
   * The API accepts a sparse array, but a form with gaps is unusable — an operator
   * setting Monday's hours should not have to know whether Monday currently exists as a
   * row. Days the server omitted are materialised as closed.
   */
  openingHours: OpeningHourDraft[]
}

export type OpeningHourDraft = {
  dayOfWeek: number
  opensAt: string
  closesAt: string
  isClosed: boolean
}

/** A day the server did not store: closed, with plausible times ready if it is opened. */
const closedDay = (dayOfWeek: number): OpeningHourDraft => ({
  dayOfWeek,
  opensAt: '09:00',
  closesAt: '17:00',
  isClosed: true,
})

function toDraft(settings: RestaurantSettings): Draft {
  return {
    restaurantName: settings.restaurantName,
    isAcceptingOrders: settings.isAcceptingOrders,
    autoAcceptOrders: settings.autoAcceptOrders,
    defaultPrepTimeMinutes: String(settings.defaultPrepTimeMinutes),
    taxRatePercent: String(settings.taxRateBps / 100),
    serviceFeePercent: String(settings.serviceFeeBps / 100),
    minimumOrderCents: settings.minimumOrderCents,
    openingHours: Array.from({ length: 7 }, (_, dayOfWeek) => {
      const stored = settings.openingHours.find((entry) => entry.dayOfWeek === dayOfWeek)
      return stored ? { ...stored } : closedDay(dayOfWeek)
    }),
  }
}

/** 24-hour "HH:mm", the format the API's regex requires. */
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

/** Compare "HH:mm" strings — lexicographic order is chronological in this format. */
const isBefore = (a: string, b: string) => a < b

/**
 * Field-by-field comparison of two weekday schedules.
 *
 * Deliberately not `JSON.stringify(a) !== JSON.stringify(b)`. That is key-order
 * dependent: the API serialises a stored day as
 * `{opensAt, closesAt, isClosed, dayOfWeek}` while a locally materialised day is
 * `{dayOfWeek, opensAt, closesAt, isClosed}`. Identical data, different string. It happens
 * to work today only because both sides are built by the same code — which is exactly the
 * kind of coupling that breaks silently the first time either side is touched, and the
 * failure would be the form reporting itself dirty the moment it loads.
 */
function hoursDiffer(a: OpeningHourDraft[], b: OpeningHourDraft[]): boolean {
  if (a.length !== b.length) return true
  return a.some((day, index) => {
    const other = b[index]
    if (!other) return true
    return (
      day.dayOfWeek !== other.dayOfWeek ||
      day.isClosed !== other.isClosed ||
      // A closed day's times are irrelevant — the server ignores them, so a difference
      // there must not mark the form dirty.
      (!day.isClosed && (day.opensAt !== other.opensAt || day.closesAt !== other.closesAt))
    )
  })
}

/**
 * Percentage string -> basis points. `8.75` -> `875`. Rounds, so 8.756 -> 876.
 *
 * Returns `null` for anything unparseable — critically including the empty string.
 * Coercing a blank field to 0 would be silent data loss: an operator who clears the tax
 * input to retype it would enable Save and, on pressing it, set the tax rate to 0%.
 * A null forces the caller to treat the field as invalid instead.
 */
function percentToBps(percent: string): number | null {
  const trimmed = percent.trim()
  if (trimmed === '') return null

  /**
   * `Number`, not `Number.parseFloat`.
   *
   * `parseFloat` stops at the first character it cannot read and returns what it has, so
   * it accepts malformed input and silently discards the rest: `parseFloat('8.7.5')` is
   * `8.7`, and `parseFloat('8abc')` is `8`. An operator fat-fingering a second decimal
   * point would have set the tax rate to 8.70% while the field still read `8.7.5`, with
   * no error shown. `Number('8.7.5')` is `NaN`, which this function reports as invalid.
   */
  const value = Number(trimmed)
  if (!Number.isFinite(value) || value < 0) return null
  return Math.round(value * 100)
}

/** Positive-integer field parse, with the same "blank is not zero" rule. */
function toPositiveInt(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  const value = Number(trimmed)
  return Number.isInteger(value) && value > 0 ? value : null
}

export type FieldErrors = Partial<
  Record<
    'restaurantName' | 'taxRatePercent' | 'serviceFeePercent' | 'defaultPrepTimeMinutes',
    string
  >
> & {
  /** Keyed by weekday so each row can show its own message. */
  openingHours?: Partial<Record<number, string>>
}

/**
 * Validate the numeric fields before anything is compared or submitted.
 *
 * Mirrors the server's own bounds (tax and service fee cap at 100%, prep time must be a
 * positive integer) so the operator is corrected inline rather than bounced by a 400.
 */
function validate(draft: Draft): FieldErrors {
  const errors: FieldErrors = {}

  // The server declares min(1)/max(160); catching it here means the operator is corrected
  // in place instead of pressing an enabled Save that is certain to 400.
  const name = draft.restaurantName.trim()
  if (name.length === 0) errors.restaurantName = 'Restaurant name is required.'
  else if (name.length > 160) errors.restaurantName = 'Restaurant name is too long.'

  const tax = percentToBps(draft.taxRatePercent)
  if (tax === null) errors.taxRatePercent = 'Enter a percentage, for example 8.75.'
  else if (tax > 10_000) errors.taxRatePercent = 'Tax rate cannot exceed 100%.'

  const fee = percentToBps(draft.serviceFeePercent)
  if (fee === null) errors.serviceFeePercent = 'Enter a percentage, for example 5.'
  else if (fee > 10_000) errors.serviceFeePercent = 'Service fee cannot exceed 100%.'

  const prep = toPositiveInt(draft.defaultPrepTimeMinutes)
  if (prep === null) errors.defaultPrepTimeMinutes = 'Enter a whole number of minutes.'
  else if (prep > 240) errors.defaultPrepTimeMinutes = 'Prep time cannot exceed 240 minutes.'

  /**
   * Opening hours, validated per weekday.
   *
   * These mirror the server exactly — it rejects a malformed time with a 400 from the zod
   * regex, and a close-before-open pair from a schema refinement. Catching both here means
   * the operator is corrected in the row that is wrong, rather than being handed a
   * whole-form error that does not say which day.
   *
   * A closed day is skipped: its times are irrelevant and the server ignores them too.
   */
  const hourErrors: Partial<Record<number, string>> = {}
  for (const day of draft.openingHours) {
    if (day.isClosed) continue
    if (!TIME_PATTERN.test(day.opensAt) || !TIME_PATTERN.test(day.closesAt)) {
      hourErrors[day.dayOfWeek] = 'Use 24-hour HH:mm, for example 17:30.'
    } else if (!isBefore(day.opensAt, day.closesAt)) {
      hourErrors[day.dayOfWeek] = 'Opening time must be before closing time.'
    }
  }
  if (Object.keys(hourErrors).length > 0) errors.openingHours = hourErrors

  return errors
}

export function useSettingsForm() {
  const toast = useToast()
  const queryClient = useQueryClient()

  const { data: settings, isPending, isError, error, refetch } = useGetSettings()
  const updateSettings = useUpdateSettings()

  const [draft, setDraft] = useState<Draft | null>(null)

  /**
   * Tracks whether the operator has touched the form.
   *
   * A ref, not state: it must not itself trigger a render, and it has to be readable from
   * inside the effect below without becoming a dependency.
   */
  const hasLocalEdits = useRef(false)

  /**
   * Seed the form from server data — but never on top of unsaved edits.
   *
   * `refetchOnWindowFocus` is enabled globally, so alt-tabbing away and back re-runs this
   * query. Without the guard, the effect rebuilt the entire draft from the server response
   * and the operator's half-finished changes vanished with no warning — the classic
   * "I typed that and it disappeared" bug. Seeding still happens on first load and after a
   * successful save, which are the only times server data should win.
   */
  useEffect(() => {
    if (settings && !hasLocalEdits.current) setDraft(toDraft(settings))
  }, [settings])

  const errors = useMemo<FieldErrors>(() => (draft ? validate(draft) : {}), [draft])
  const hasErrors = Object.keys(errors).length > 0

  /**
   * Only changed fields are submitted. Sending the whole object would work, but it would
   * also silently overwrite anything another operator changed between our load and our
   * save — a partial patch touches only what this form actually edited.
   */
  const changes = useMemo<UpdateSettingsRequest>(() => {
    if (!settings || !draft) return {}
    const patch: UpdateSettingsRequest = {}

    if (draft.restaurantName.trim() !== settings.restaurantName) {
      patch.restaurantName = draft.restaurantName.trim()
    }
    if (draft.isAcceptingOrders !== settings.isAcceptingOrders) {
      patch.isAcceptingOrders = draft.isAcceptingOrders
    }
    if (draft.autoAcceptOrders !== settings.autoAcceptOrders) {
      patch.autoAcceptOrders = draft.autoAcceptOrders
    }

    /**
     * Numeric fields are only included when they parse. An unparseable field is an
     * *error*, never a zero — without this guard, clearing the tax input would compare
     * 0 against 875, register as a change, and quietly zero the tax rate on save.
     */
    const prep = toPositiveInt(draft.defaultPrepTimeMinutes)
    if (prep !== null && prep !== settings.defaultPrepTimeMinutes) {
      patch.defaultPrepTimeMinutes = prep
    }

    const tax = percentToBps(draft.taxRatePercent)
    if (tax !== null && tax !== settings.taxRateBps) {
      patch.taxRateBps = tax
    }

    const fee = percentToBps(draft.serviceFeePercent)
    if (fee !== null && fee !== settings.serviceFeeBps) {
      patch.serviceFeeBps = fee
    }

    if (draft.minimumOrderCents !== settings.minimumOrderCents) {
      patch.minimumOrderCents = draft.minimumOrderCents
    }

    /**
     * Opening hours are sent whole or not at all — the API replaces the array rather than
     * merging it, so a partial send would silently drop the days left out.
     *
     * Compared by value against what the server holds, normalised to the same seven-day
     * shape `toDraft` produces. Without that normalisation a server array missing a day
     * would never compare equal to the draft and the form would report itself dirty on
     * load, enabling Save before the operator had touched anything.
     */
    const storedHours = Array.from({ length: 7 }, (_, dayOfWeek) => {
      const stored = settings.openingHours.find((entry) => entry.dayOfWeek === dayOfWeek)
      return stored ? { ...stored } : closedDay(dayOfWeek)
    })

    if (hoursDiffer(draft.openingHours, storedHours)) {
      patch.openingHours = draft.openingHours
    }

    return patch
  }, [settings, draft])

  const isDirty = Object.keys(changes).length > 0

  /**
   * Live worked example, computed with the SAME function the server uses to price real
   * orders. If this number is wrong, orders are priced wrong — they cannot diverge.
   */
  const example = useMemo(() => {
    if (!draft) return null
    const taxRateBps = percentToBps(draft.taxRatePercent)
    const serviceFeeBps = percentToBps(draft.serviceFeePercent)
    // Do not price the example at 0% while a field is blank or mid-edit — that would show
    // a confidently wrong "customer pays" figure.
    if (taxRateBps === null || serviceFeeBps === null) return null
    return calculateOrderTotals([{ unitPriceCents: EXAMPLE_SUBTOTAL_CENTS, quantity: 1 }], {
      taxRateBps,
      serviceFeeBps,
    })
  }, [draft])

  const update = useCallback(<K extends keyof Draft>(key: K, value: Draft[K]) => {
    hasLocalEdits.current = true
    setDraft((current) => (current ? { ...current, [key]: value } : current))
  }, [])

  const save = useCallback(async () => {
    if (!isDirty || hasErrors) return
    try {
      await updateSettings.mutateAsync({ data: changes })
      hasLocalEdits.current = false
      await queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() })
      toast.success('Settings saved')
    } catch (caught) {
      toast.error(
        'Could not save settings',
        describeError(caught),
      )
    }
  }, [isDirty, hasErrors, changes, updateSettings, queryClient, toast])

  /**
   * Update one weekday's hours.
   *
   * Marks the form dirty through the same `hasLocalEdits` ref the scalar `update` uses, so
   * a background refetch cannot overwrite half-edited opening hours either.
   */
  const updateDay = useCallback(
    (dayOfWeek: number, patch: Partial<OpeningHourDraft>) => {
      hasLocalEdits.current = true
      setDraft((current) =>
        current
          ? {
              ...current,
              openingHours: current.openingHours.map((day) =>
                day.dayOfWeek === dayOfWeek ? { ...day, ...patch } : day,
              ),
            }
          : current,
      )
    },
    [],
  )

  return {
    settings,
    draft,
    updateDay,
    errors,
    hasErrors,
    isDirty,
    isLoading: isPending,
    isError,
    error,
    refetch,
    example,
    update,
    save,
    isSaving: updateSettings.isPending,
  }
}
