/**
 * Skeleton — placeholder geometry shown while content loads.
 *
 * Design decisions worth knowing before changing anything here:
 *
 *  1. **Pulse, not sweep.** The animation is a looping opacity pulse of a highlight layer
 *     over a base layer, rather than a translating gradient sweep. A sweep needs a linear
 *     gradient, which React Native has no primitive for (it would mean a new dependency),
 *     and it costs a layout-affecting transform on every frame. Opacity is the one
 *     property both platforms can animate off the JS thread cheaply.
 *
 *  2. **Two layers instead of an animated colour.** Interpolating `backgroundColor`
 *     forces `useNativeDriver: false`. Stacking a `skeletonHighlight` layer over a
 *     `skeleton` base and animating only its opacity keeps the animation native-driven on
 *     iOS/Android and is a no-op fallback on react-native-web.
 *
 *  3. **Skeletons are invisible to assistive tech.** Fake bars announced as content are
 *     worse than silence. Every skeleton hides itself and its descendants; the loading
 *     state must be announced once by the container — a `Spinner` label or an
 *     `accessibilityState={{ busy: true }}` on the region — not by each bar.
 *
 *  4. **Widths are deterministic.** `SkeletonText` varies line widths from a fixed table
 *     rather than `Math.random()`, because random widths change on every re-render and
 *     produce a visible twitch while data is still loading.
 */
import { useEffect, useRef } from 'react'
import {
  Animated,
  Easing,
  StyleSheet,
  View,
  type DimensionValue,
  type StyleProp,
  type ViewStyle,
} from 'react-native'

import { useTheme } from '../theme/ThemeProvider'
import type { Radius } from '../tokens'

export type SkeletonProps = {
  /** Any RN dimension: a number, a `'60%'` string, or `'auto'`. Defaults to full width. */
  width?: DimensionValue
  height?: number
  radius?: Radius
  /**
   * Escape hatch for callers that need to opt out of motion (reduced-motion preferences,
   * screenshot tests, long lists where dozens of loops are wasteful).
   */
  animated?: boolean
  style?: StyleProp<ViewStyle>
  testID?: string
}

/** Opacity range of the highlight layer. Subtle on purpose — a skeleton must not strobe. */
const PULSE_MIN = 0
const PULSE_MAX = 1

/**
 * Shared pulse driver.
 *
 * Returns an `Animated.Value` cycling 0 -> 1 -> 0 forever. The loop is stopped and the
 * value reset on unmount; a running `Animated.loop` holds a frame callback alive and will
 * keep ticking after the component is gone if it is never stopped.
 */
function usePulse(enabled: boolean): Animated.Value {
  const value = useRef(new Animated.Value(PULSE_MIN)).current

  useEffect(() => {
    if (!enabled) {
      value.setValue(PULSE_MIN)
      return
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(value, {
          toValue: PULSE_MAX,
          // Deliberately slower than the interaction durations in `motion`: this is
          // ambient breathing, not feedback about something the operator just did.
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(value, {
          toValue: PULSE_MIN,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    )

    loop.start()

    return () => {
      loop.stop()
      value.setValue(PULSE_MIN)
    }
  }, [enabled, value])

  return value
}

export function Skeleton({
  width = '100%',
  height,
  radius = 'md',
  animated = true,
  style,
  testID,
}: SkeletonProps) {
  const theme = useTheme()
  const pulse = usePulse(animated)

  return (
    <View
      testID={testID}
      // Hidden from screen readers on all three platforms: iOS honours
      // `accessibilityElementsHidden`, Android `importantForAccessibility`, and
      // react-native-web maps the latter to `aria-hidden`.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          width,
          height: height ?? theme.spacing[3],
          borderRadius: theme.radius[radius],
          backgroundColor: theme.color.skeleton,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      <Animated.View
        style={{
          ...StyleSheet.absoluteFillObject,
          backgroundColor: theme.color.skeletonHighlight,
          opacity: pulse,
        }}
      />
    </View>
  )
}

/* -------------------------------------------------------------------------- */
/*                                SkeletonText                                 */
/* -------------------------------------------------------------------------- */

/**
 * Line widths, in order, cycled for paragraphs longer than the table.
 *
 * Uniform-width bars read as obviously fake — real prose has a ragged right edge — so the
 * widths vary slightly and the final line is always short, mimicking where a paragraph
 * actually ends.
 */
const LINE_WIDTHS: readonly DimensionValue[] = ['100%', '92%', '97%', '88%']
const LAST_LINE_WIDTH: DimensionValue = '62%'

export type SkeletonTextProps = {
  /** Number of placeholder lines. Match the typical length of the real content. */
  lines?: number
  /** Bar height. Should approximate the line height of the text it stands in for. */
  lineHeight?: number
  animated?: boolean
  style?: StyleProp<ViewStyle>
  testID?: string
}

export function SkeletonText({
  lines = 3,
  lineHeight,
  animated = true,
  style,
  testID,
}: SkeletonTextProps) {
  const theme = useTheme()
  const count = Math.max(1, Math.floor(lines))
  const barHeight = lineHeight ?? theme.spacing[3]

  return (
    <View testID={testID} style={[{ gap: theme.spacing[2], alignSelf: 'stretch' }, style]}>
      {Array.from({ length: count }, (_, index) => {
        const isLast = index === count - 1
        // `noUncheckedIndexedAccess` makes the modulo lookup optional; the fallback is
        // full width, which is also the sane default if the table is ever emptied.
        const cycled = LINE_WIDTHS[index % LINE_WIDTHS.length] ?? '100%'
        // A single-line skeleton keeps its full width: shortening it would read as a
        // label rather than as a sentence.
        const width = isLast && count > 1 ? LAST_LINE_WIDTH : cycled

        return (
          <Skeleton
            key={index}
            width={width}
            height={barHeight}
            radius="sm"
            animated={animated}
          />
        )
      })}
    </View>
  )
}

/* -------------------------------------------------------------------------- */
/*                                SkeletonCard                                 */
/* -------------------------------------------------------------------------- */

export type SkeletonCardProps = {
  /** Body lines below the title. */
  lines?: number
  /** Leading square block, standing in for a thumbnail or avatar. */
  showMedia?: boolean
  /** Reserve a footer row, for cards whose real content ends in actions. */
  showAction?: boolean
  animated?: boolean
  style?: StyleProp<ViewStyle>
  testID?: string
}

/**
 * A card-shaped placeholder.
 *
 * It draws the real card chrome — surface, border, radius, padding — and fakes only the
 * content. Fading in a fully-formed card over a grey blob is a visible jump; keeping the
 * container identical means only the text inside it changes when data arrives.
 */
export function SkeletonCard({
  lines = 2,
  showMedia = false,
  showAction = false,
  animated = true,
  style,
  testID,
}: SkeletonCardProps) {
  const theme = useTheme()

  return (
    <View
      testID={testID}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          alignSelf: 'stretch',
          padding: theme.spacing[4],
          gap: theme.spacing[4],
          borderRadius: theme.radius.xl,
          borderWidth: theme.borderWidth.hairline,
          borderColor: theme.color.border,
          backgroundColor: theme.color.surface,
          ...theme.elevation.sm,
        },
        style,
      ]}
    >
      <View style={{ flexDirection: 'row', gap: theme.spacing[3], alignItems: 'center' }}>
        {showMedia ? (
          <Skeleton width={theme.spacing[10]} height={theme.spacing[10]} radius="lg" animated={animated} />
        ) : null}
        <View style={{ flex: 1, gap: theme.spacing[2] }}>
          {/* Title bar is taller and shorter than the body — the same contrast the real
              type scale creates between `heading` and `bodySm`. */}
          <Skeleton width="48%" height={theme.spacing[4]} radius="sm" animated={animated} />
          <Skeleton width="30%" height={theme.spacing[2.5]} radius="sm" animated={animated} />
        </View>
      </View>

      <SkeletonText lines={lines} animated={animated} />

      {showAction ? (
        <View style={{ flexDirection: 'row', gap: theme.spacing[2] }}>
          <Skeleton width={theme.spacing[20]} height={theme.spacing[8]} radius="lg" animated={animated} />
          <Skeleton width={theme.spacing[16]} height={theme.spacing[8]} radius="lg" animated={animated} />
        </View>
      ) : null}
    </View>
  )
}
