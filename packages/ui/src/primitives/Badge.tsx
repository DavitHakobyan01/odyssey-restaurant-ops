/**
 * Badge — the status pill, and `StatusDot`, its one-glyph sibling.
 *
 * An operations dashboard is mostly status: an order is pending, a table is seated, a
 * shift is understaffed. Badge is the single component that renders that, which is why it
 * takes a `Tone` from the token layer rather than a colour and resolves it through
 * `toneColors()`. Re-deriving tone colours locally is the specific mistake this component
 * exists to prevent — do that in three components and "pending amber" quietly becomes
 * three different ambers.
 *
 * Notes on the visual decisions:
 *
 *  - **All three variants carry a hairline border**, transparent where the design has no
 *    visible one. Without it, switching a badge from `subtle` to `outline` — which happens
 *    at runtime in filter chips — would change its box by 2px and nudge the row.
 *  - **No fixed height.** Height comes from the type scale's line height plus token
 *    padding, so a badge grows correctly when the OS font size is enlarged instead of
 *    clipping its own text.
 *  - **Badge is not interactive** by design. It is a label, not a control, so it has no
 *    hover/press/focus states and no `onPress`. A pressable status belongs in a Button
 *    with an `iconLeft`, where the five-state contract is already implemented.
 */
import { View, type StyleProp, type ViewStyle } from 'react-native'
import type { ReactNode } from 'react'

import { useTheme } from '../theme/ThemeProvider'
import { toneColors, type Theme, type Tone } from '../tokens'
import { Text } from './Text'

export type BadgeVariant = 'subtle' | 'solid' | 'outline'
export type BadgeSize = 'sm' | 'md'

export type BadgeProps = {
  children?: ReactNode
  /** Semantic status. The colour mapping belongs to the theme, never to the call site. */
  tone?: Tone
  variant?: BadgeVariant
  size?: BadgeSize
  /** Leading glyph — a `StatusDot`, a spinner, an app icon. No icon library is assumed. */
  icon?: ReactNode
  /**
   * Accessible name. Set it when the visible text is an abbreviation ("2h SLA") or when
   * the badge's meaning depends on colour, which a screen reader cannot convey.
   */
  accessibilityLabel?: string
  style?: StyleProp<ViewStyle>
  testID?: string
}

/**
 * Size spec expressed entirely in spacing-scale keys.
 *
 * `caption` at `sm` and `bodySm` at `md` is deliberate: `sm` badges appear inside dense
 * table rows where they must not out-weigh the cell text next to them.
 */
const SIZE_SPEC = {
  sm: { paddingH: 1.5, paddingV: 0.5, gap: 1, variant: 'caption' },
  md: { paddingH: 2, paddingV: 1, gap: 1.5, variant: 'bodySm' },
} as const

type BadgeVisual = {
  background: string
  border: string
  text: string
}

function resolveVisual(theme: Theme, tone: Tone, variant: BadgeVariant): BadgeVisual {
  const tc = toneColors(theme, tone)

  switch (variant) {
    case 'solid':
      return {
        background: tc.solid,
        border: 'transparent',
        // The theme guarantees this reads on any filled surface in either mode, which is
        // why the component never picks a text colour based on the tone itself.
        text: theme.color.textInverse,
      }

    case 'outline':
      return { background: 'transparent', border: tc.border, text: tc.text }

    case 'subtle':
    default:
      return { background: tc.background, border: 'transparent', text: tc.text }
  }
}

export function Badge({
  children,
  tone = 'neutral',
  variant = 'subtle',
  size = 'md',
  icon,
  accessibilityLabel,
  style,
  testID,
}: BadgeProps) {
  const theme = useTheme()
  const spec = SIZE_SPEC[size]
  const visual = resolveVisual(theme, tone, variant)

  return (
    <View
      testID={testID}
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel}
      style={[
        {
          // `flex-start` keeps a badge hugging its content inside a stretching column —
          // without it a badge in a table cell stretches to the full column width.
          alignSelf: 'flex-start',
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing[spec.gap],
          paddingHorizontal: theme.spacing[spec.paddingH],
          paddingVertical: theme.spacing[spec.paddingV],
          borderRadius: theme.radius.full,
          borderWidth: theme.borderWidth.hairline,
          backgroundColor: visual.background,
          borderColor: visual.border,
        },
        style,
      ]}
    >
      {icon}
      {children !== undefined && children !== null ? (
        <Text variant={spec.variant} weight="500" numberOfLines={1} style={{ color: visual.text }}>
          {children}
        </Text>
      ) : null}
    </View>
  )
}

/* -------------------------------------------------------------------------- */
/*                                  StatusDot                                  */
/* -------------------------------------------------------------------------- */

export type StatusDotSize = 'sm' | 'md' | 'lg'

export type StatusDotProps = {
  tone?: Tone
  size?: StatusDotSize
  /**
   * Accessible name. A bare dot is meaningless to a screen reader and invisible to a
   * colour-blind operator, so a dot used as the *only* status carrier must be labelled —
   * and preferably paired with text.
   */
  accessibilityLabel?: string
  style?: StyleProp<ViewStyle>
  testID?: string
}

/** Diameters, in spacing-scale keys: 6 / 8 / 10px. */
const DOT_SIZE = { sm: 1.5, md: 2, lg: 2.5 } as const

/**
 * A filled circle in a semantic tone.
 *
 * Exists for dense rows — a 40px table row fits a dot plus text where it does not fit a
 * pill, and a column of dots is far faster to scan down than a column of pills. It uses
 * `solid` from the same `toneColors()` triple as Badge, so a "pending" dot and a "pending"
 * badge can never drift apart.
 */
export function StatusDot({
  tone = 'neutral',
  size = 'md',
  accessibilityLabel,
  style,
  testID,
}: StatusDotProps) {
  const theme = useTheme()
  const diameter = theme.spacing[DOT_SIZE[size]]
  const tc = toneColors(theme, tone)

  return (
    <View
      testID={testID}
      accessibilityRole={accessibilityLabel !== undefined ? 'image' : 'none'}
      accessibilityLabel={accessibilityLabel}
      style={[
        {
          width: diameter,
          height: diameter,
          borderRadius: theme.radius.full,
          backgroundColor: tc.solid,
        },
        style,
      ]}
    />
  )
}
