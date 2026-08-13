/**
 * Spinner — the system's only activity indicator.
 *
 * A thin wrapper over React Native's `ActivityIndicator`, which exists for three reasons
 * that the raw component cannot satisfy:
 *
 *  1. **Colour comes from a token.** `ActivityIndicator` defaults to a platform grey that
 *     is invisible on a dark surface and wrong on a filled button. Forcing callers to pick
 *     a semantic `tone` means the spinner is legible in both themes by construction.
 *
 *  2. **The footprint is fixed per size.** Swapping content for a spinner is the single
 *     most common cause of layout jump in a dashboard, so each size reserves an exact
 *     square box; the indicator is centred inside it and cannot change the parent's
 *     measurement as it appears.
 *
 *  3. **It announces itself.** A bare indicator is invisible to screen readers. Here the
 *     wrapper carries `progressbar` + `busy`, so assistive tech reports that work is in
 *     flight rather than silently reading nothing.
 *
 * Note on sizing: `ActivityIndicator`'s numeric `size` is Android-only, so intermediate
 * sizes are produced with a `transform: scale` on the indicator itself. That is the only
 * approach that renders identically on iOS, Android and react-native-web.
 */
import {
  ActivityIndicator,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native'

import { useTheme } from '../theme/ThemeProvider'
import type { Theme, TypographyVariant } from '../tokens'
import { Text } from './Text'

export type SpinnerSize = 'sm' | 'md' | 'lg'

/** Semantic colours only — a spinner on a primary button must not be hard-coded grey. */
export type SpinnerTone = 'default' | 'muted' | 'primary' | 'inverse'

export type SpinnerProps = {
  size?: SpinnerSize
  tone?: SpinnerTone
  /** Visible text beside the spinner. Also serves as the accessible name when present. */
  label?: string
  /**
   * Accessible name used when there is no visible `label`. Defaults to 'Loading' so the
   * component is never silent, but a specific string ('Loading orders') is always better.
   */
  accessibilityLabel?: string
  /** Fill the available space and centre — for a panel that is waiting on its first load. */
  center?: boolean
  style?: StyleProp<ViewStyle>
  testID?: string
}

const SIZE_SPEC: Record<
  SpinnerSize,
  { indicator: 'small' | 'large'; scale: number; box: number; text: TypographyVariant }
> = {
  // `box` reserves the rendered footprint of the (possibly scaled) indicator, so the
  // surrounding row keeps its height whether the spinner is mounted or not.
  sm: { indicator: 'small', scale: 0.72, box: 16, text: 'caption' },
  md: { indicator: 'small', scale: 1, box: 20, text: 'bodySm' },
  lg: { indicator: 'large', scale: 1, box: 36, text: 'body' },
}

function resolveColor(theme: Theme, tone: SpinnerTone): string {
  switch (tone) {
    case 'primary':
      return theme.color.primary
    case 'muted':
      return theme.color.textMuted
    case 'inverse':
      return theme.color.textInverse
    case 'default':
    default:
      return theme.color.text
  }
}

export function Spinner({
  size = 'md',
  tone = 'muted',
  label,
  accessibilityLabel,
  center = false,
  style,
  testID,
}: SpinnerProps) {
  const theme = useTheme()
  const spec = SIZE_SPEC[size]
  const color = resolveColor(theme, tone)

  return (
    <View
      testID={testID}
      // Grouped into a single accessibility node so the visible label is not announced a
      // second time after the progressbar's name.
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label ?? accessibilityLabel ?? 'Loading'}
      accessibilityState={{ busy: true }}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing[2],
        },
        center ? { flex: 1, alignSelf: 'stretch', justifyContent: 'center' } : null,
        style,
      ]}
    >
      <View
        style={{
          width: spec.box,
          height: spec.box,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ActivityIndicator
          size={spec.indicator}
          color={color}
          style={spec.scale === 1 ? undefined : { transform: [{ scale: spec.scale }] }}
        />
      </View>

      {label ? (
        <Text variant={spec.text} tone={tone === 'inverse' ? 'inverse' : 'muted'}>
          {label}
        </Text>
      ) : null}
    </View>
  )
}
