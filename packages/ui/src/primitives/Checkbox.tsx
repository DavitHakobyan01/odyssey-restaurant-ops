/**
 * Checkbox — a boolean that takes effect on save, plus the third state a boolean cannot
 * express on its own.
 *
 * Three visual states, two of them "on": unchecked, checked, and **indeterminate**, which
 * a parent row uses when only some of its children are selected. Without it, a "select
 * all" header has to lie in one direction or the other, and operators learn not to trust
 * it. `accessibilityState.checked` carries `'mixed'` so assistive technology is told the
 * same thing the pixels say.
 *
 * Pressing an indeterminate box emits `true`. Selecting the remainder is what someone
 * reaching for a half-filled "select all" wants; clearing everything they had already
 * chosen is not.
 *
 * The mark is drawn with Views — a rotated corner for the tick, a bar for the mixed state
 * — because this package takes no icon dependency. Its geometry is derived from the box
 * size rather than hard-coded, so the two sizes cannot drift apart.
 */
import { useState, type ReactNode } from 'react'
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native'

import { useTheme } from '../theme/ThemeProvider'
import type { Theme } from '../tokens'
import { useField } from './Field'
import { Text } from './Text'

export type CheckboxSize = 'sm' | 'md'

export type CheckboxProps = {
  checked: boolean
  /** Overrides the checked visual with a mixed mark. Reported as `'mixed'` to a11y. */
  indeterminate?: boolean
  /** Receives the value the box would move to: an indeterminate box emits `true`. */
  onChange?: (checked: boolean) => void
  /** Text beside the box. The whole row is the touch target. */
  label?: ReactNode
  /** Second line under the label. */
  description?: string
  /** Falls back to the surrounding Field's disabled state. */
  disabled?: boolean
  /** Falls back to the surrounding Field showing an error. */
  invalid?: boolean
  size?: CheckboxSize
  /** Required when there is no visible `label`, e.g. a row-select box in a table. */
  accessibilityLabel?: string
  style?: StyleProp<ViewStyle>
  testID?: string
}

const CHECKBOX_SIZE_SPEC = {
  sm: { box: 16, textVariant: 'bodySm' },
  md: { box: 20, textVariant: 'body' },
} as const

const FOCUS_RING_OFFSET = 3

type CheckboxVisual = { background: string; border: string; mark: string }

/**
 * One switch for the whole state matrix (3 checked states x 4 interaction states x
 * invalid), for the same reason Button resolves its variants in one place: gaps are
 * visible here and invisible when scattered across style objects.
 */
function resolveCheckboxVisual(
  theme: Theme,
  state: {
    on: boolean
    hovered: boolean
    pressed: boolean
    disabled: boolean
    invalid: boolean
  },
): CheckboxVisual {
  if (state.disabled) {
    return {
      background: state.on ? theme.color.neutral : theme.color.surfaceDisabled,
      border: theme.color.border,
      mark: theme.color.textInverse,
    }
  }

  if (state.on) {
    return {
      background: state.pressed
        ? theme.color.primaryActive
        : state.hovered
          ? theme.color.primaryHover
          : theme.color.primary,
      // An invalid required checkbox still needs its red edge once ticked, otherwise the
      // field that is complaining looks identical to the fields that are not.
      border: state.invalid ? theme.color.danger : 'transparent',
      mark: theme.color.textInverse,
    }
  }

  return {
    background: state.pressed
      ? theme.color.surfaceActive
      : state.hovered
        ? theme.color.surfaceHover
        : theme.color.surface,
    border: state.invalid
      ? theme.color.danger
      : state.hovered
        ? theme.color.borderStrong
        : theme.color.border,
    mark: 'transparent',
  }
}

export function Checkbox({
  checked,
  indeterminate = false,
  onChange,
  label,
  description,
  disabled,
  invalid,
  size = 'md',
  accessibilityLabel,
  style,
  testID,
}: CheckboxProps) {
  const theme = useTheme()
  const field = useField()
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)

  const isDisabled = disabled ?? field?.disabled ?? false
  const isInvalid = invalid ?? field?.invalid ?? false

  const spec = CHECKBOX_SIZE_SPEC[size]
  const box = spec.box
  // Tick geometry as fractions of the box: a corner whose right and bottom edges are
  // drawn, rotated 45 degrees. Kept proportional so `sm` and `md` look like one glyph.
  const tickWidth = Math.round(box * 0.3)
  const tickHeight = Math.round(box * 0.55)
  const barWidth = Math.round(box * 0.5)

  const on = checked || indeterminate
  const hasText = label !== undefined || description !== undefined

  return (
    <Pressable
      testID={testID}
      disabled={isDisabled}
      onPress={isDisabled ? undefined : () => onChange?.(indeterminate ? true : !checked)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      accessibilityRole="checkbox"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={field?.description}
      accessibilityState={{
        disabled: isDisabled,
        checked: indeterminate ? 'mixed' : checked,
      }}
      style={[
        {
          flexDirection: 'row',
          // Top-aligned against a wrapping label so the box sits on the first line;
          // centred when it stands alone in a table cell.
          alignItems: hasText ? 'flex-start' : 'center',
          justifyContent: hasText ? 'flex-start' : 'center',
          gap: theme.spacing[2.5],
          // The box is 20pt at most; the row it lives in is a proper touch target.
          minHeight: theme.layout.minTouchTarget,
          minWidth: theme.layout.minTouchTarget,
          paddingVertical: theme.spacing[1.5],
          alignSelf: hasText ? 'stretch' : 'flex-start',
          opacity: isDisabled ? 0.7 : 1,
          cursor: isDisabled ? 'auto' : 'pointer',
        },
        style,
      ]}
    >
      {({ pressed }) => {
        const visual = resolveCheckboxVisual(theme, {
          on,
          hovered,
          pressed,
          disabled: isDisabled,
          invalid: isInvalid,
        })

        return (
          <>
            <View>
              <View
                style={{
                  width: box,
                  height: box,
                  borderRadius: theme.radius.sm,
                  borderWidth: theme.borderWidth.hairline,
                  borderColor: visual.border,
                  backgroundColor: visual.background,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {indeterminate ? (
                  <View
                    style={{
                      width: barWidth,
                      height: theme.borderWidth.thick,
                      borderRadius: theme.radius.full,
                      backgroundColor: visual.mark,
                    }}
                  />
                ) : checked ? (
                  <View
                    style={{
                      width: tickWidth,
                      height: tickHeight,
                      borderRightWidth: theme.borderWidth.thick,
                      borderBottomWidth: theme.borderWidth.thick,
                      borderColor: visual.mark,
                      // The rotated corner's optical centre sits below its bounding box's
                      // centre; lifting it by the stroke width re-centres the tick.
                      transform: [
                        { translateY: -theme.borderWidth.thick / 2 },
                        { rotate: '45deg' },
                      ],
                    }}
                  />
                ) : null}
              </View>

              {focused ? (
                <View
                  style={{
                    pointerEvents: 'none',
                    position: 'absolute',
                    top: -FOCUS_RING_OFFSET,
                    left: -FOCUS_RING_OFFSET,
                    right: -FOCUS_RING_OFFSET,
                    bottom: -FOCUS_RING_OFFSET,
                    borderRadius: theme.radius.sm + FOCUS_RING_OFFSET,
                    borderWidth: theme.borderWidth.focus,
                    borderColor: theme.color.borderFocus,
                  }}
                />
              ) : null}
            </View>

            {hasText ? (
              <View style={{ flex: 1, gap: theme.spacing[0.5] }}>
                {label !== undefined ? (
                  <Text variant={spec.textVariant} tone={isDisabled ? 'disabled' : 'default'}>
                    {label}
                  </Text>
                ) : null}
                {description !== undefined ? (
                  <Text variant="bodySm" tone={isDisabled ? 'disabled' : 'muted'}>
                    {description}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </>
        )
      }}
    </Pressable>
  )
}
