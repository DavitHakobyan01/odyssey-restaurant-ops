/**
 * EmptyState — what a list, table or panel shows when it has nothing to show.
 *
 * An empty region with no explanation is indistinguishable from a region that failed to
 * load, so every collection surface in the product is expected to render this instead of
 * nothing. Three rules are baked in:
 *
 *  1. **Empty is not an error.** Everything here is muted and calm — no tone colours, no
 *     danger red. `ErrorState` is the component for something having gone wrong, and
 *     keeping the two visually distinct is how an operator tells "no orders yet" apart
 *     from "orders failed to load" at a glance.
 *
 *  2. **Generous vertical padding is the point.** The whitespace is what signals
 *     deliberate emptiness rather than a half-rendered screen.
 *
 *  3. **Width is the caller's decision.** The token layer has no reading-measure token,
 *     and inventing one here would be a literal. The component centres itself inside
 *     whatever box it is given; constrain that box where a long description would
 *     otherwise stretch across a full-width table.
 */
import { View, type StyleProp, type ViewStyle } from 'react-native'
import type { ReactNode } from 'react'

import { useTheme } from '../theme/ThemeProvider'
import type { Spacing, TypographyVariant } from '../tokens'
import { Text } from './Text'

export type EmptyStateSize = 'sm' | 'md'

export type EmptyStateProps = {
  title: string
  description?: string
  /**
   * Leading illustration or glyph. The system ships no icon set, so this is a node the
   * caller supplies; it is placed in a circular sunken well to give it a consistent
   * footprint whatever its intrinsic size.
   */
  icon?: ReactNode
  /** Primary way out of the empty state — usually a `Button` that creates the first item. */
  action?: ReactNode
  /** `sm` for an empty panel or card, `md` for a full page or table body. */
  size?: EmptyStateSize
  style?: StyleProp<ViewStyle>
  testID?: string
}

const SIZE_SPEC: Record<
  EmptyStateSize,
  {
    paddingY: Spacing
    paddingX: Spacing
    well: Spacing
    gap: Spacing
    title: TypographyVariant
    description: TypographyVariant
  }
> = {
  sm: { paddingY: 8, paddingX: 4, well: 10, gap: 2, title: 'heading', description: 'bodySm' },
  md: { paddingY: 16, paddingX: 6, well: 12, gap: 3, title: 'titleSm', description: 'body' },
}

export function EmptyState({
  title,
  description,
  icon,
  action,
  size = 'md',
  style,
  testID,
}: EmptyStateProps) {
  const theme = useTheme()
  const spec = SIZE_SPEC[size]
  const wellSize = theme.spacing[spec.well]

  return (
    <View
      testID={testID}
      style={[
        {
          alignSelf: 'stretch',
          alignItems: 'center',
          justifyContent: 'center',
          gap: theme.spacing[spec.gap],
          paddingVertical: theme.spacing[spec.paddingY],
          paddingHorizontal: theme.spacing[spec.paddingX],
        },
        style,
      ]}
    >
      {icon ? (
        <View
          style={{
            width: wellSize,
            height: wellSize,
            borderRadius: theme.radius.full,
            alignItems: 'center',
            justifyContent: 'center',
            // Sunken rather than raised: an empty state should recede, not compete with
            // the populated regions around it.
            backgroundColor: theme.color.surfaceSunken,
            marginBottom: theme.spacing[1],
          }}
        >
          {icon}
        </View>
      ) : null}

      <Text variant={spec.title} align="center">
        {title}
      </Text>

      {description ? (
        <Text variant={spec.description} tone="muted" align="center">
          {description}
        </Text>
      ) : null}

      {/* Extra space above the action so it reads as a separate offer, not as a caption
          attached to the description. */}
      {action ? <View style={{ paddingTop: theme.spacing[2] }}>{action}</View> : null}
    </View>
  )
}
