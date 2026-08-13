/**
 * Switch — a boolean that takes effect immediately.
 *
 * Use it for settings that apply the moment they are flipped ("Accepting orders",
 * "Show sold-out items"). Anything that only takes effect on save should be a Checkbox;
 * the animation here is a promise that something already happened.
 *
 * Notes on the implementation:
 *
 *  - **`Animated`, not Reanimated.** Reanimated is not a dependency of this package and
 *    adding one for a 140ms slide would be a poor trade. The RN `Animated` API is in core
 *    and works identically under react-native-web.
 *
 *  - **`useNativeDriver: false`, deliberately.** The track colour is interpolated, and
 *    colour interpolation is not supported by the native driver. Driving position
 *    natively and colour on the JS thread would need two animations that can visibly
 *    desynchronise; one JS-driven animation over a `motion.duration.fast` window is both
 *    simpler and consistent across platforms.
 *
 *  - **The knob is a surface, the track is a state.** The knob uses `color.surface` in
 *    both themes so it always reads as a physical object sitting on the track, and the
 *    track carries the meaning (primary when on, a neutral border colour when off). That
 *    is why dark mode needs no branch here.
 *
 *  - **The touch target is bigger than the switch.** The visible track is only 26pt tall,
 *    so the Pressable is padded out to `layout.minTouchTarget` and the ring is drawn
 *    around the track, not around the padding — a focus ring that traces invisible
 *    padding looks like a bug.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Animated, Easing, Pressable, View, type StyleProp, type ViewStyle } from 'react-native'

import { webCursor } from '../theme/platform'
import { useTheme } from '../theme/ThemeProvider'
import type { Theme } from '../tokens'
import { Text } from './Text'

export type SwitchSize = 'sm' | 'md'

export type SwitchProps = {
  value: boolean
  onValueChange?: (value: boolean) => void
  disabled?: boolean
  size?: SwitchSize
  /** Text beside the switch. The whole row becomes the touch target when present. */
  label?: ReactNode
  /** Second line under the label — what turning this on will actually do. */
  description?: string
  /** Required when there is no visible `label`. */
  accessibilityLabel?: string
  style?: StyleProp<ViewStyle>
  testID?: string
}

/**
 * Track geometry.
 *
 * `inset` is the gap between knob and track edge; knob diameter is derived from it so
 * that changing the track height cannot produce a knob that overflows its rail.
 */
const SWITCH_SIZE_SPEC = {
  sm: { width: 36, height: 20, inset: 2, textVariant: 'bodySm' },
  md: { width: 44, height: 26, inset: 3, textVariant: 'body' },
} as const

const FOCUS_RING_OFFSET = 3

type SwitchTrackColors = { off: string; on: string }

/**
 * Track colours per interaction state, as one function for the same reason Button has
 * one: a missing hover colour is obvious in a five-line switch and invisible when it is
 * spread across five style objects.
 */
function resolveTrackColors(
  theme: Theme,
  state: { hovered: boolean; pressed: boolean; disabled: boolean },
): SwitchTrackColors {
  if (state.disabled) {
    return { off: theme.color.surfaceDisabled, on: theme.color.neutral }
  }
  if (state.pressed) {
    return { off: theme.color.neutral, on: theme.color.primaryActive }
  }
  if (state.hovered) {
    return { off: theme.color.neutral, on: theme.color.primaryHover }
  }
  return { off: theme.color.borderStrong, on: theme.color.primary }
}

export function Switch({
  value,
  onValueChange,
  disabled = false,
  size = 'md',
  label,
  description,
  accessibilityLabel,
  style,
  testID,
}: SwitchProps) {
  const theme = useTheme()
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)

  const spec = SWITCH_SIZE_SPEC[size]
  const knobSize = spec.height - spec.inset * 2
  const travel = spec.width - knobSize - spec.inset * 2

  // Seeded from the current value so a switch that mounts already-on does not animate
  // itself on into view — a list of settings would otherwise flicker on every render.
  const progress = useRef(new Animated.Value(value ? 1 : 0)).current
  const duration = theme.motion.duration.fast

  useEffect(() => {
    Animated.timing(progress, {
      toValue: value ? 1 : 0,
      duration,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start()
  }, [value, progress, duration])

  const knobOffset = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, travel],
  })

  const hasText = label !== undefined || description !== undefined

  return (
    <Pressable
      testID={testID}
      disabled={disabled}
      onPress={disabled ? undefined : () => onValueChange?.(!value)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled, checked: value }}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: hasText ? 'flex-start' : 'center',
          gap: theme.spacing[3],
          // The control is short and, at `sm`, narrow; the target is neither.
          minHeight: theme.layout.minTouchTarget,
          minWidth: theme.layout.minTouchTarget,
          alignSelf: hasText ? 'stretch' : 'flex-start',
          opacity: disabled ? 0.7 : 1,
          ...webCursor(disabled ? 'not-allowed' : 'pointer'),
        },
        style,
      ]}
    >
      {({ pressed }) => {
        const track = resolveTrackColors(theme, { hovered, pressed, disabled })

        return (
          <>
            <View>
              <Animated.View
                style={{
                  width: spec.width,
                  height: spec.height,
                  borderRadius: theme.radius.full,
                  padding: spec.inset,
                  justifyContent: 'center',
                  backgroundColor: progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [track.off, track.on],
                  }),
                }}
              >
                <Animated.View
                  style={{
                    width: knobSize,
                    height: knobSize,
                    borderRadius: theme.radius.full,
                    backgroundColor: theme.color.surface,
                    transform: [{ translateX: knobOffset }],
                    ...theme.elevation.sm,
                  }}
                />
              </Animated.View>

              {/*
                Ring hugs the track rather than the padded row, and is a separate layer so
                focusing cannot resize the switch. Same rule as Button.
              */}
              {focused ? (
                <View
                  style={{
                    pointerEvents: 'none',
                    position: 'absolute',
                    top: -FOCUS_RING_OFFSET,
                    left: -FOCUS_RING_OFFSET,
                    right: -FOCUS_RING_OFFSET,
                    bottom: -FOCUS_RING_OFFSET,
                    borderRadius: theme.radius.full,
                    borderWidth: theme.borderWidth.focus,
                    borderColor: theme.color.borderFocus,
                  }}
                />
              ) : null}
            </View>

            {hasText ? (
              <View style={{ flex: 1, gap: theme.spacing[0.5] }}>
                {label !== undefined ? (
                  <Text variant={spec.textVariant} tone={disabled ? 'disabled' : 'default'}>
                    {label}
                  </Text>
                ) : null}
                {description !== undefined ? (
                  <Text variant="bodySm" tone={disabled ? 'disabled' : 'muted'}>
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
