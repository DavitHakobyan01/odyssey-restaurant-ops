/**
 * Field — the label / requirement / message chrome that every form control wears.
 *
 * Why this exists as a separate component rather than as props on `Input`:
 *
 *  1. **One implementation of the form row.** If `Input`, `Textarea`, `Select` and
 *     `Checkbox` each grew their own `label` and `error` props, four components would own
 *     four slightly different opinions about label weight, gap and error colour, and they
 *     would drift the first time one of them was touched. Here the row is written once
 *     and the controls are dumb boxes that slot into it.
 *
 *  2. **Controls stay composable.** A control can be used bare (inside a table cell, a
 *     toolbar, a filter bar) where a label would be wrong. Wrapping is opt-in.
 *
 *  3. **Accessibility wiring is centralised.** Field mints the id, hangs it off the label,
 *     and hands the control everything it needs through context. A control author cannot
 *     forget to associate its label because it never had to do it by hand.
 *
 * Two decisions worth spelling out:
 *
 * - **Helper and error share one slot.** An error *replaces* the helper text rather than
 *   appearing beneath it. Showing both makes the operator read two sentences to find the
 *   one that matters, and the row's height stays constant when validation fires — which
 *   is the real point, because a form that grows by 16px per invalid field pushes the
 *   submit button out from under the cursor. When a field has no helper text and the
 *   error would still cause a reflow, pass `reserveMessageSpace`.
 *
 * - **The description is delivered as `accessibilityHint`, not `aria-describedby`.**
 *   React Native has no cross-platform `describedby`; `accessibilityHint` is the portable
 *   equivalent and reads correctly on iOS, Android and react-native-web.
 */
import { createContext, useContext, useId, useMemo, type ReactNode } from 'react'
import { View, type StyleProp, type ViewStyle } from 'react-native'

import { useTheme } from '../theme/ThemeProvider'
import { Text } from './Text'

/* -------------------------------------------------------------------------- */
/*                                   Context                                   */
/* -------------------------------------------------------------------------- */

/**
 * What a Field tells the control inside it.
 *
 * Controls read this *as a default*, never as an override: an explicit `invalid` or
 * `disabled` prop on the control always wins, so a control can still be driven directly
 * when it is used outside a Field.
 */
export type FieldContextValue = {
  /** Stable id for the control itself. Mirrors the web's `htmlFor` relationship. */
  controlId: string
  /** `nativeID` of the label element, for `accessibilityLabelledBy` on the control. */
  labelId: string
  /** True when the Field is showing an error message. */
  invalid: boolean
  required: boolean
  disabled: boolean
  /**
   * Requirement plus helper/error text, flattened into one string for
   * `accessibilityHint`. Undefined when there is nothing to say.
   */
  description?: string
}

const FieldContext = createContext<FieldContextValue | null>(null)

/**
 * Read the surrounding Field, if any.
 *
 * Returns `null` rather than throwing: unlike `useTheme`, being outside a Field is a
 * legitimate, common state (a search box in a toolbar), so this must not be an error.
 */
export function useField(): FieldContextValue | null {
  return useContext(FieldContext)
}

/* -------------------------------------------------------------------------- */
/*                                    Field                                    */
/* -------------------------------------------------------------------------- */

export type FieldProps = {
  /** The control. Reads Field's id, invalid and disabled state from context. */
  children: ReactNode
  label?: string
  /** Adds the marker to the label and 'Required.' to the control's hint. */
  required?: boolean
  /** Guidance shown at rest. Hidden while an error is displayed. */
  helperText?: string
  /** Presence of a non-empty string is what makes the Field invalid. */
  error?: string
  /**
   * Override the generated control id. Useful when a caller needs a stable, predictable
   * id (tests, deep links, a native label association it wires up itself).
   */
  id?: string
  /** Greys the label and propagates to the control unless the control overrides it. */
  disabled?: boolean
  /**
   * Keep the message row mounted at its full height even with no message, so that a
   * field which validates on blur cannot shift the layout below it. Off by default
   * because it costs vertical space on every field in a dense form.
   */
  reserveMessageSpace?: boolean
  style?: StyleProp<ViewStyle>
  testID?: string
}

export function Field({
  children,
  label,
  required = false,
  helperText,
  error,
  id,
  disabled = false,
  reserveMessageSpace = false,
  style,
  testID,
}: FieldProps) {
  const theme = useTheme()

  // useId gives a value that is stable across renders and unique per instance, so two
  // copies of the same form on one screen cannot collide on label association.
  const generatedId = useId()
  const controlId = id ?? generatedId
  const labelId = `${controlId}-label`

  const invalid = typeof error === 'string' && error.trim().length > 0
  const message = invalid ? error : helperText

  const context = useMemo<FieldContextValue>(() => {
    const parts: string[] = []
    if (required) parts.push('Required.')
    if (message !== undefined && message.length > 0) parts.push(message)

    return {
      controlId,
      labelId,
      invalid,
      required,
      disabled,
      description: parts.length > 0 ? parts.join(' ') : undefined,
    }
  }, [controlId, labelId, invalid, required, disabled, message])

  const messageLineHeight = theme.typography.caption.lineHeight

  return (
    <View testID={testID} style={[{ gap: theme.spacing[1.5], alignSelf: 'stretch' }, style]}>
      {label !== undefined && label.length > 0 ? (
        // The View, not the Text, carries the nativeID: `Text` deliberately exposes no
        // id prop, and assistive tech resolves the name by traversing this node anyway.
        <View nativeID={labelId}>
          <Text variant="bodySm" weight="500" tone={disabled ? 'disabled' : 'muted'}>
            {label}
            {required ? (
              <Text variant="bodySm" weight="500" tone="danger">
                {' *'}
              </Text>
            ) : null}
          </Text>
        </View>
      ) : null}

      <FieldContext.Provider value={context}>{children}</FieldContext.Provider>

      {/*
        Announced politely rather than assertively: validation messages appear while the
        operator is still typing elsewhere, and an assertive region would interrupt them
        mid-word on every keystroke.
      */}
      {message !== undefined && message.length > 0 ? (
        <View accessibilityLiveRegion="polite">
          <Text variant="caption" tone={invalid ? 'danger' : 'subtle'}>
            {message}
          </Text>
        </View>
      ) : reserveMessageSpace ? (
        <View style={{ height: messageLineHeight }} />
      ) : null}
    </View>
  )
}

/**
 * Lay out several Fields as one form section.
 *
 * Exists so that vertical rhythm between fields is a token rather than a margin invented
 * at each call site — the same argument that produced `Stack`, restated for forms so that
 * a form's spacing can be retuned in one place.
 */
export type FieldGroupProps = {
  children: ReactNode
  /** Section heading, rendered above the fields. */
  title?: string
  style?: StyleProp<ViewStyle>
  testID?: string
}

export function FieldGroup({ children, title, style, testID }: FieldGroupProps) {
  const theme = useTheme()

  return (
    <View testID={testID} style={[{ gap: theme.spacing[4], alignSelf: 'stretch' }, style]}>
      {title !== undefined && title.length > 0 ? (
        <Text variant="heading">{title}</Text>
      ) : null}
      {children}
    </View>
  )
}
