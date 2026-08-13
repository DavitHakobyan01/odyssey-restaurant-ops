/**
 * Card — the standard surface container.
 *
 * Everything in the product that is not the page background sits on a Card: KPI tiles,
 * form panels, the table container, mobile order rows. Because it is the only surface
 * primitive, "what does a raised thing look like" is answered in exactly one place.
 *
 * Three structural decisions worth knowing about:
 *
 *  1. **Two layers, not one.** The outer view carries the elevation and the inner view
 *     carries the border and `overflow: 'hidden'`. They cannot be the same node: on iOS a
 *     view with `overflow: 'hidden'` clips its own shadow away, so a single-node card
 *     would either lose its shadow or leak square-cornered children (a table's tinted
 *     header row, an image) past its rounded corners. Splitting them gets both.
 *
 *  2. **Interactive cards lift rather than tint.** Hover raises the card one elevation
 *     step and strengthens the border; press drops it back to its resting elevation and
 *     tints the surface. That reads as a physical push, and it survives dark mode where a
 *     shadow alone is nearly invisible — hence the border change carrying half the signal.
 *
 *  3. **The focus ring is drawn outside both layers**, as an absolutely-positioned sibling
 *     of the clipped surface. Same rule as Button: a focus ring must never change the
 *     element's box, or focusing a card would reflow the grid it sits in. It lives on the
 *     outer (unclipped) layer because the inner one would crop it.
 *
 * Two composition styles are supported, and they should not be mixed:
 *
 *     // Slots — Card supplies the padding and separators.
 *     <Card header={<Text variant="heading">Today</Text>} footer={<Button>Save</Button>}>
 *       …body…
 *     </Card>
 *
 *     // Composed — the sections bring their own padding, so the Card has none.
 *     <Card padding={0}>
 *       <CardHeader title="Today" subtitle="12 covers" actions={<Button>Edit</Button>} />
 *       <CardBody>…</CardBody>
 *       <CardFooter><Button>Save</Button></CardFooter>
 *     </Card>
 */
import { useState } from 'react'
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native'
import type { ReactNode } from 'react'

import { useTheme } from '../theme/ThemeProvider'
import type { Elevation, Spacing, Theme } from '../tokens'
import { Text } from './Text'

/**
 * How far outside the box the focus ring sits. Matches Button so every focusable thing in
 * the product has an identically-offset ring.
 */
const FOCUS_RING_OFFSET = 3

/**
 * Hover lift: each elevation's "one step up" neighbour.
 *
 * Written as a map rather than arithmetic on an index because `xl` must lift to itself —
 * a modal-level card has nowhere higher to go, and silently exceeding the top of the
 * elevation scale is how z-ordering bugs start.
 */
const ELEVATION_LIFT: Record<Elevation, Elevation> = {
  none: 'sm',
  sm: 'md',
  md: 'lg',
  lg: 'xl',
  xl: 'xl',
}

export type CardProps = {
  children?: ReactNode
  /** Padding applied to the body region. Defaults to `4` (16px). */
  padding?: Spacing
  /** Resting elevation. Interactive cards lift one step above this on hover. */
  elevation?: Elevation
  /**
   * Marks the card as a target: adds the hover lift, the pointer cursor and the full
   * five-state treatment. Implied by `onPress`, but can be set on its own for a card
   * whose interaction lives on a child control.
   */
  interactive?: boolean
  onPress?: () => void
  /** Rendered above the body in its own padded region with a separator below it. */
  header?: ReactNode
  /** Rendered below the body in its own padded region with a separator above it. */
  footer?: ReactNode
  /** Stretch to fill the parent on both axes — gives an embedded scroll list a bounded height. */
  fill?: boolean
  disabled?: boolean
  /** Accessible name. Required when the card is pressable and has no text of its own. */
  accessibilityLabel?: string
  style?: StyleProp<ViewStyle>
  testID?: string
}

type CardVisual = {
  background: string
  border: string
  elevation: Elevation
}

/**
 * Resolve the card's surface for a given interaction state.
 *
 * Kept as one function, as in Button, so the whole state matrix is readable at a glance
 * and a missing hover treatment is obvious rather than buried in a style object.
 */
function resolveVisual(
  theme: Theme,
  restingElevation: Elevation,
  state: { interactive: boolean; hovered: boolean; pressed: boolean; disabled: boolean },
): CardVisual {
  if (!state.interactive || state.disabled) {
    return {
      background: state.disabled ? theme.color.surfaceDisabled : theme.color.surface,
      border: theme.color.border,
      elevation: state.disabled ? 'none' : restingElevation,
    }
  }

  if (state.pressed) {
    return {
      background: theme.color.surfaceActive,
      border: theme.color.borderStrong,
      // Drops back to rest so the press reads as the card being pushed in.
      elevation: restingElevation,
    }
  }

  if (state.hovered) {
    return {
      background: theme.color.surface,
      border: theme.color.borderStrong,
      elevation: ELEVATION_LIFT[restingElevation],
    }
  }

  return {
    background: theme.color.surface,
    border: theme.color.border,
    elevation: restingElevation,
  }
}

export function Card({
  children,
  padding = 4,
  elevation = 'sm',
  interactive = false,
  onPress,
  header,
  footer,
  fill = false,
  disabled = false,
  accessibilityLabel,
  style,
  testID,
}: CardProps) {
  const theme = useTheme()
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)

  // A disabled card stays a Pressable so it still announces `disabled` to assistive tech —
  // swapping it for a plain View would make it silently vanish from the a11y tree.
  const isPressable = interactive || onPress !== undefined
  const isInteractive = isPressable && !disabled
  const restingVisual = resolveVisual(theme, elevation, {
    interactive: isInteractive,
    hovered,
    pressed: false,
    disabled,
  })

  const surfaceStyle = (visual: CardVisual): ViewStyle => ({
    borderRadius: theme.radius.xl,
    borderWidth: theme.borderWidth.hairline,
    borderColor: visual.border,
    backgroundColor: visual.background,
    // Clips a header's tinted background / an image to the rounded corners. Safe here
    // because the shadow lives on the parent, not on this node.
    overflow: 'hidden',
    ...(fill ? { flex: 1 } : {}),
    ...(isInteractive ? { cursor: 'pointer' as const } : {}),
  })

  const content = (
    <>
      {header !== undefined && header !== null ? (
        <View
          style={{
            padding: theme.spacing[padding],
            borderBottomWidth: theme.borderWidth.hairline,
            borderBottomColor: theme.color.border,
          }}
        >
          {header}
        </View>
      ) : null}

      <View style={{ padding: theme.spacing[padding], ...(fill ? { flex: 1 } : {}) }}>
        {children}
      </View>

      {footer !== undefined && footer !== null ? (
        <View
          style={{
            padding: theme.spacing[padding],
            borderTopWidth: theme.borderWidth.hairline,
            borderTopColor: theme.color.border,
          }}
        >
          {footer}
        </View>
      ) : null}
    </>
  )

  return (
    <View
      style={[
        {
          borderRadius: theme.radius.xl,
          // The shadow layer needs an opaque background of its own: on iOS a shadow is
          // cast from the view's backing colour, and a transparent parent casts nothing.
          backgroundColor: theme.color.surface,
          ...theme.elevation[restingVisual.elevation],
          ...(fill ? { flex: 1 } : {}),
        },
        style,
      ]}
    >
      {isPressable ? (
        <Pressable
          testID={testID}
          onPress={disabled ? undefined : onPress}
          disabled={disabled}
          onHoverIn={() => setHovered(true)}
          onHoverOut={() => setHovered(false)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          accessibilityState={{ disabled }}
          style={({ pressed }) =>
            surfaceStyle(
              resolveVisual(theme, elevation, {
                interactive: isInteractive,
                hovered,
                pressed,
                disabled,
              }),
            )
          }
        >
          {content}
        </Pressable>
      ) : (
        <View
          testID={testID}
          accessibilityLabel={accessibilityLabel}
          style={surfaceStyle(restingVisual)}
        >
          {content}
        </View>
      )}

      {/*
        Outside both layers: the inner surface clips, so a ring drawn there would be cut
        in half, and a ring drawn as a border would resize the card and shift its grid.
      */}
      {focused ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: -FOCUS_RING_OFFSET,
            left: -FOCUS_RING_OFFSET,
            right: -FOCUS_RING_OFFSET,
            bottom: -FOCUS_RING_OFFSET,
            borderRadius: theme.radius.xl + FOCUS_RING_OFFSET,
            borderWidth: theme.borderWidth.focus,
            borderColor: theme.color.borderFocus,
          }}
        />
      ) : null}
    </View>
  )
}

/* -------------------------------------------------------------------------- */
/*                                  Sections                                   */
/* -------------------------------------------------------------------------- */

export type CardHeaderProps = {
  /** Rendered as a `heading`. A string rather than a node so the type scale cannot be bypassed. */
  title?: string
  subtitle?: string
  /** Trailing controls — a menu button, a filter, a status Badge. */
  actions?: ReactNode
  /** Full control over the header's contents. Replaces `title` / `subtitle` when given. */
  children?: ReactNode
  padding?: Spacing
  style?: StyleProp<ViewStyle>
  testID?: string
}

/**
 * Header section for the composed style.
 *
 * Supplies its own padding and bottom separator, so it belongs inside a `<Card padding={0}>`
 * — passing it to Card's `header` slot would double both.
 */
export function CardHeader({
  title,
  subtitle,
  actions,
  children,
  padding = 4,
  style,
  testID,
}: CardHeaderProps) {
  const theme = useTheme()

  return (
    <View
      testID={testID}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing[3],
          padding: theme.spacing[padding],
          borderBottomWidth: theme.borderWidth.hairline,
          borderBottomColor: theme.color.border,
        },
        style,
      ]}
    >
      <View style={{ flex: 1, gap: theme.spacing[0.5] }}>
        {children ?? (
          <>
            {title !== undefined ? (
              <Text variant="heading" numberOfLines={1}>
                {title}
              </Text>
            ) : null}
            {subtitle !== undefined ? (
              <Text variant="bodySm" tone="muted" numberOfLines={2}>
                {subtitle}
              </Text>
            ) : null}
          </>
        )}
      </View>
      {actions}
    </View>
  )
}

export type CardBodyProps = {
  children?: ReactNode
  padding?: Spacing
  /** Fill the remaining height — for a body that hosts a scroll list. */
  fill?: boolean
  style?: StyleProp<ViewStyle>
  testID?: string
}

export function CardBody({ children, padding = 4, fill = false, style, testID }: CardBodyProps) {
  const theme = useTheme()
  return (
    <View
      testID={testID}
      style={[{ padding: theme.spacing[padding], ...(fill ? { flex: 1 } : {}) }, style]}
    >
      {children}
    </View>
  )
}

export type CardFooterProps = {
  children?: ReactNode
  /**
   * Horizontal arrangement. Defaults to `end`, because a card footer almost always holds
   * confirm/cancel actions and those belong on the trailing edge.
   */
  align?: 'start' | 'end' | 'between'
  padding?: Spacing
  style?: StyleProp<ViewStyle>
  testID?: string
}

const FOOTER_JUSTIFY = {
  start: 'flex-start',
  end: 'flex-end',
  between: 'space-between',
} as const

export function CardFooter({
  children,
  align = 'end',
  padding = 4,
  style,
  testID,
}: CardFooterProps) {
  const theme = useTheme()
  return (
    <View
      testID={testID}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: FOOTER_JUSTIFY[align],
          gap: theme.spacing[2],
          padding: theme.spacing[padding],
          borderTopWidth: theme.borderWidth.hairline,
          borderTopColor: theme.color.border,
        },
        style,
      ]}
    >
      {children}
    </View>
  )
}
