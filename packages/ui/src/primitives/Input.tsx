/**
 * Input — the single-line text control, and the shell that every other boxed control
 * (Textarea, Select) borrows so the whole form reads as one component.
 *
 * It follows Button's contract: five explicit interaction states, a focus ring drawn
 * outside the box so focusing never reflows the page, and no colour that did not come
 * from the theme.
 *
 * Decisions worth knowing about:
 *
 *  - **The border width never changes.** Rest, hover, focus and invalid all use
 *    `borderWidth.hairline` and differ only in colour. React Native lays borders out
 *    inside the box, so a 1px -> 2px change on focus would nudge the text and the slots
 *    by a pixel — a twitch the operator sees on every field they touch.
 *
 *  - **Invalid outranks focus for the *border*, but never suppresses the ring.** A field
 *    that turns teal the moment you focus it has hidden the very thing you need to fix,
 *    so the border stays `danger` while focused; keyboard focus is still unmistakable
 *    because the ring is a separate layer outside the box.
 *
 *  - **The whole box is a Pressable that focuses the input.** Padding and slots are dead
 *    zones otherwise, which is infuriating with a mouse. It is marked non-accessible and
 *    non-focusable so it does not add a second tab stop in front of the real input.
 *
 *  - **`MoneyInput` speaks integer cents.** See its own note — this is the one place in
 *    the system where a float would be an actual money bug rather than a rounding nit.
 */
import { useRef, useState, type ComponentRef, type ReactNode } from 'react'
import {
  Pressable,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native'

import { useTheme } from '../theme/ThemeProvider'
import type { Theme } from '../tokens'
import { useField } from './Field'
import { Text } from './Text'

/* -------------------------------------------------------------------------- */
/*                          Shared chrome (also used by Textarea/Select)       */
/* -------------------------------------------------------------------------- */

export type InputSize = 'sm' | 'md' | 'lg'

/**
 * Size table.
 *
 * `md` is exactly `layout.minTouchTarget`, so the default field is thumb-sized on a
 * phone without anyone having to think about it. `sm` is deliberately below that: it is
 * for filter bars and table cells where the row itself is the touch target, and it should
 * not be used as a form field on a touch screen.
 */
export const INPUT_SIZE_SPEC = {
  sm: { height: 36, paddingH: 2.5, gap: 2, textVariant: 'bodySm' },
  md: { height: 44, paddingH: 3, gap: 2, textVariant: 'body' },
  lg: { height: 52, paddingH: 4, gap: 2.5, textVariant: 'body' },
} as const

/**
 * Distance from the box to the focus ring. Matches Button so that a focused input and a
 * focused button in the same toolbar have rings on the same optical rhythm.
 */
export const FOCUS_RING_OFFSET = 3

export type InputInteractionState = {
  hovered: boolean
  pressed: boolean
  focused: boolean
  disabled: boolean
  invalid: boolean
}

export type InputSurface = {
  background: string
  border: string
  text: string
  placeholder: string
}

/**
 * Resolve the field's colours for one interaction state.
 *
 * Exported because Textarea and Select must be pixel-identical to Input; sharing the
 * function is what guarantees that, whereas sharing a screenshot never has.
 */
export function resolveInputSurface(theme: Theme, state: InputInteractionState): InputSurface {
  if (state.disabled) {
    return {
      background: theme.color.surfaceDisabled,
      border: theme.color.border,
      text: theme.color.textDisabled,
      placeholder: theme.color.textDisabled,
    }
  }

  const border = state.invalid
    ? theme.color.danger
    : state.focused || state.pressed
      ? theme.color.borderFocus
      : state.hovered
        ? theme.color.borderStrong
        : theme.color.border

  return {
    background: theme.color.surface,
    border,
    text: theme.color.text,
    placeholder: theme.color.textSubtle,
  }
}

/**
 * The focus ring, as a sibling layer rather than a border.
 *
 * Shared instead of copied because "focus is visible and costs no layout" is a rule of
 * the system, and rules that live in three files stop being rules.
 */
export function InputFocusRing({ visible, radius }: { visible: boolean; radius: number }) {
  const theme = useTheme()
  if (!visible) return null

  return (
    <View
      style={{
        pointerEvents: 'none',
        position: 'absolute',
        top: -FOCUS_RING_OFFSET,
        left: -FOCUS_RING_OFFSET,
        right: -FOCUS_RING_OFFSET,
        bottom: -FOCUS_RING_OFFSET,
        borderRadius: radius + FOCUS_RING_OFFSET,
        borderWidth: theme.borderWidth.focus,
        borderColor: theme.color.borderFocus,
      }}
    />
  )
}

/* -------------------------------------------------------------------------- */
/*                                    Input                                    */
/* -------------------------------------------------------------------------- */

export type InputProps = {
  value?: string
  onChangeText?: (text: string) => void
  placeholder?: string
  /** Falls back to the surrounding Field's disabled state. */
  disabled?: boolean
  /** Falls back to the surrounding Field showing an error. */
  invalid?: boolean
  size?: InputSize
  /** Icon or adornment before the text. Kept as a slot so no icon library is needed. */
  leftSlot?: ReactNode
  /** Icon, unit, or a small action after the text. */
  rightSlot?: ReactNode
  keyboardType?: KeyboardTypeOptions
  secureTextEntry?: boolean
  autoFocus?: boolean
  onFocus?: () => void
  /** Fires after the field loses focus — the usual moment to validate. */
  onBlur?: () => void
  onSubmitEditing?: () => void
  maxLength?: number
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters'
  autoCorrect?: boolean
  /**
   * Accessible name for a field used without a Field wrapper (a toolbar search box).
   * Inside a Field the label is associated automatically and this can be omitted.
   */
  accessibilityLabel?: string
  /** Styles the outer box, not the text. */
  style?: StyleProp<ViewStyle>
  /** Styles the editable text — used by MoneyInput for tabular numerals. */
  textStyle?: StyleProp<TextStyle>
  testID?: string
}

export function Input({
  value,
  onChangeText,
  placeholder,
  disabled,
  invalid,
  size = 'md',
  leftSlot,
  rightSlot,
  keyboardType,
  secureTextEntry = false,
  autoFocus = false,
  onFocus,
  onBlur,
  onSubmitEditing,
  maxLength,
  autoCapitalize,
  autoCorrect,
  accessibilityLabel,
  style,
  textStyle,
  testID,
}: InputProps) {
  const theme = useTheme()
  const field = useField()
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null)

  // An explicit prop always beats the Field, so a control can be driven directly when it
  // is used outside one — the Field is a default, not an authority.
  const isDisabled = disabled ?? field?.disabled ?? false
  const isInvalid = invalid ?? field?.invalid ?? false

  const spec = INPUT_SIZE_SPEC[size]
  const scale = theme.typography[spec.textVariant]

  return (
    <View style={[{ alignSelf: 'stretch' }, style]}>
      <Pressable
        // Not a tab stop and not an accessibility element: it exists only so that
        // clicking the padding focuses the input the operator was aiming at.
        accessible={false}
        focusable={false}
        disabled={isDisabled}
        onPress={() => inputRef.current?.focus()}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        style={({ pressed }) => {
          const surface = resolveInputSurface(theme, {
            hovered,
            pressed,
            focused,
            disabled: isDisabled,
            invalid: isInvalid,
          })

          return {
            height: spec.height,
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing[spec.gap],
            paddingHorizontal: theme.spacing[spec.paddingH],
            borderRadius: theme.radius.lg,
            borderWidth: theme.borderWidth.hairline,
            borderColor: surface.border,
            backgroundColor: surface.background,
          }
        }}
      >
        {({ pressed }) => {
          const surface = resolveInputSurface(theme, {
            hovered,
            pressed,
            focused,
            disabled: isDisabled,
            invalid: isInvalid,
          })

          return (
            <>
              {leftSlot}

              <TextInput
                ref={inputRef}
                testID={testID}
                nativeID={field?.controlId}
                accessibilityLabelledBy={field?.labelId}
                accessibilityLabel={accessibilityLabel}
                accessibilityHint={field?.description}
                accessibilityState={{ disabled: isDisabled }}
                value={value}
                onChangeText={onChangeText}
                placeholder={placeholder}
                placeholderTextColor={surface.placeholder}
                editable={!isDisabled}
                keyboardType={keyboardType}
                secureTextEntry={secureTextEntry}
                autoFocus={autoFocus}
                autoCapitalize={autoCapitalize}
                autoCorrect={autoCorrect}
                maxLength={maxLength}
                onFocus={() => {
                  setFocused(true)
                  onFocus?.()
                }}
                onBlur={() => {
                  setFocused(false)
                  onBlur?.()
                }}
                onSubmitEditing={onSubmitEditing}
                style={[
                  {
                    flex: 1,
                    height: '100%',
                    // The box already provides vertical rhythm; platform default padding
                    // here would fight the fixed height and mis-centre the text.
                    paddingVertical: 0,
                    color: surface.text,
                    fontFamily: theme.fontFamily.sans,
                    fontSize: scale.fontSize,
                    letterSpacing: scale.letterSpacing,
                    // No lineHeight: on Android an explicit line height on a fixed-height
                    // TextInput clips descenders. The box controls the height instead.
                    // Suppress the browser's own focus outline — we draw a layout-stable
                    // ring instead, and two rings on one field reads as a rendering bug.
                    // RN's type has no 'none', so a zero-width outline says it portably.
                    outlineStyle: 'solid',
                    outlineWidth: 0,
                  },
                  textStyle,
                ]}
              />

              {rightSlot}

              <InputFocusRing visible={focused} radius={theme.radius.lg} />
            </>
          )
        }}
      </Pressable>
    </View>
  )
}

/* -------------------------------------------------------------------------- */
/*                                 MoneyInput                                  */
/* -------------------------------------------------------------------------- */

/**
 * Money, in integer cents, end to end.
 *
 * The backend stores money as integer cents and so does this control: `value` is cents
 * and `onChangeValue` emits cents. Nothing here ever produces a float. That is not
 * pedantry — a float-based money input reliably produces `19.99 * 100 = 1998.9999...`,
 * and an order that is a cent short is a real defect that reaches a real customer.
 *
 * Editing model: the component holds a *draft string* while the field is focused and
 * falls back to formatting `value` when it is not. Without the draft, typing "1" into an
 * empty field would round-trip through the parent as 100 cents and reappear as "1.00"
 * with the caret in the wrong place; the draft lets the operator type "1", "1.", "1.0"
 * and "1.05" in that order while the parent still receives a valid cents value at every
 * keystroke.
 *
 * The prop is `onChangeValue` rather than `onChange` because `onChange` already means
 * "raw native event" everywhere else in React Native, and quietly redefining it in one
 * component is how call sites end up passing the wrong handler.
 */
export type MoneyInputProps = Omit<
  InputProps,
  'value' | 'onChangeText' | 'keyboardType' | 'secureTextEntry' | 'maxLength' | 'autoCapitalize'
> & {
  /** Amount in integer cents. Values below zero are clamped away. */
  value: number
  /** Receives integer cents. Fires on every accepted keystroke. */
  onChangeValue?: (cents: number) => void
  /** Rendered in the left slot. Pass `leftSlot` explicitly to override entirely. */
  currencySymbol?: string
}

/** Cents -> "12.34". Integer arithmetic only; never divides. */
export function formatCentsForInput(cents: number): string {
  const safe = Number.isFinite(cents) ? Math.max(0, Math.round(cents)) : 0
  const whole = Math.floor(safe / 100)
  const fraction = safe % 100
  return `${whole}.${String(fraction).padStart(2, '0')}`
}

/**
 * "12.3" -> 1230. Rejects anything that is not a digit or a decimal point.
 *
 * Built from integer parts rather than `Number(text) * 100` so that no intermediate
 * float exists to round the wrong way.
 */
export function parseCentsFromInput(text: string): number {
  if (text.length === 0) return 0

  const [wholeRaw, fractionRaw] = text.split('.')
  const wholeDigits = (wholeRaw ?? '').replace(/\D/g, '')
  const fractionDigits = (fractionRaw ?? '').replace(/\D/g, '')

  const whole = wholeDigits.length > 0 ? Number.parseInt(wholeDigits, 10) : 0
  const fraction =
    fractionDigits.length > 0 ? Number.parseInt(`${fractionDigits}00`.slice(0, 2), 10) : 0

  if (!Number.isFinite(whole) || !Number.isFinite(fraction)) return 0
  return Math.max(0, whole * 100 + fraction)
}

/**
 * Keep only what can be part of a positive decimal: digits, one decimal point, and at
 * most two digits after it. Rejecting at input time is kinder than accepting then
 * silently rewriting, because the operator sees immediately that the key did nothing.
 */
function sanitizeMoneyText(text: string): string {
  const digitsAndDots = text.replace(/[^0-9.]/g, '')
  const firstDot = digitsAndDots.indexOf('.')
  if (firstDot === -1) return digitsAndDots

  const whole = digitsAndDots.slice(0, firstDot)
  const fraction = digitsAndDots.slice(firstDot + 1).replace(/\./g, '').slice(0, 2)
  return `${whole}.${fraction}`
}

export function MoneyInput({
  value,
  onChangeValue,
  currencySymbol = '$',
  leftSlot,
  onFocus,
  onBlur,
  size = 'md',
  disabled,
  textStyle,
  ...rest
}: MoneyInputProps) {
  const field = useField()
  // null means "not editing" — display is derived from the prop, which is the source of
  // truth. A non-null draft means the operator owns the string until they leave.
  const [draft, setDraft] = useState<string | null>(null)

  const isDisabled = disabled ?? field?.disabled ?? false
  const spec = INPUT_SIZE_SPEC[size]

  return (
    <Input
      {...rest}
      size={size}
      disabled={isDisabled}
      value={draft ?? formatCentsForInput(value)}
      // decimal-pad, not numeric: the numeric pad on iOS has no decimal point, which
      // makes it impossible to enter cents.
      keyboardType="decimal-pad"
      textStyle={[{ fontVariant: ['tabular-nums'] }, textStyle]}
      leftSlot={
        leftSlot ?? (
          <Text variant={spec.textVariant} tone={isDisabled ? 'disabled' : 'subtle'} numeric>
            {currencySymbol}
          </Text>
        )
      }
      onChangeText={(text) => {
        const sanitized = sanitizeMoneyText(text)
        setDraft(sanitized)
        // Empty is a real value (0), not "no value": a cleared price field means free,
        // and leaving the parent on its previous number would silently keep the old price.
        onChangeValue?.(parseCentsFromInput(sanitized))
      }}
      onFocus={() => {
        setDraft((current) => current ?? formatCentsForInput(value))
        onFocus?.()
      }}
      onBlur={() => {
        // Dropping the draft re-renders from the prop, which normalises "7." to "7.00"
        // and, in a controlled form, shows the operator exactly what was stored.
        setDraft(null)
        onBlur?.()
      }}
    />
  )
}
