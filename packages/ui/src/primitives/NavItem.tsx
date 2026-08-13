/**
 * NavItem — a single entry in the sidebar (or any vertical navigation rail).
 *
 * Follows Button's contract for interaction: all five states are explicit, hover is
 * tracked through `Pressable`'s hover callbacks (which simply never fire on native), and
 * the focus ring is drawn outside the box so focusing an item cannot reflow the rail.
 *
 * Three decisions worth knowing about:
 *
 *  1. **Selection is a colour change *and* a leading accent bar.** Colour alone is not a
 *     sufficient signal — it fails for colour-blind operators and washes out on a dim
 *     kitchen display. The bar is absolutely positioned so adding it costs no layout,
 *     which means the item does not move by 3px the moment it becomes active.
 *
 *  2. **The row is always `minTouchTarget` tall, collapsed or not.** A rail that shrinks
 *     its rows when collapsed would be unusable on a tablet, which is exactly the device
 *     the collapsed rail exists for.
 *
 *  3. **A string icon is rendered through `Text`.** With no icon library in the system,
 *     callers pass glyphs; React Native cannot render a bare string outside `<Text>`, so
 *     accepting `ReactNode` and blindly rendering it would crash on native. Routing
 *     strings through `Text` also lets the glyph inherit the item's state colour, which an
 *     arbitrary node cannot do.
 */
import { useState } from 'react'
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native'
import type { ReactNode } from 'react'

import { useTheme } from '../theme/ThemeProvider'
import type { Theme } from '../tokens'
import { Text } from './Text'

export type NavItemProps = {
  /** Visible label, and the accessible name when `collapsed` hides it. */
  label: string
  /** Glyph or node shown before the label. Strings are rendered through `Text`. */
  icon?: ReactNode
  /** The route this item points at is the current one. */
  active?: boolean
  onPress?: () => void
  /** Unread/pending count. Rendered as a pill, or as a dot when `collapsed`. */
  badge?: number
  /** Icon-only rail. The label becomes the accessible name instead of visible text. */
  collapsed?: boolean
  disabled?: boolean
  /** Overrides the accessible name. Defaults to `label`, which is enough in every case. */
  accessibilityLabel?: string
  style?: StyleProp<ViewStyle>
  testID?: string
}

type NavVisual = {
  background: string
  content: string
}

/**
 * Resolve the item's colours for one point in the state matrix.
 *
 * Kept as a single switch-free function rather than a style sheet per state because the
 * ordering *is* the specification: disabled beats active, active beats hover, and hover
 * beats rest. Written as nested ternaries in the style sheet this ordering is invisible;
 * written here a reviewer can check it in one pass.
 */
function resolveVisual(
  theme: Theme,
  state: { active: boolean; hovered: boolean; pressed: boolean; disabled: boolean },
): NavVisual {
  if (state.disabled) {
    return { background: 'transparent', content: theme.color.textDisabled }
  }

  if (state.active) {
    // The selected item keeps its tinted ground in every interaction state: darkening it
    // on hover would imply the press does something new, when it is already the open page.
    return { background: theme.color.primarySubtle, content: theme.color.primaryText }
  }

  if (state.pressed) return { background: theme.color.surfaceActive, content: theme.color.text }
  if (state.hovered) return { background: theme.color.surfaceHover, content: theme.color.text }

  // Resting items are muted so the active one wins the rail without needing extra weight.
  return { background: 'transparent', content: theme.color.textMuted }
}

/**
 * Count pill shared by every navigation surface (rail items and tabs).
 *
 * Deliberately not the general-purpose `Badge` primitive: navigation counts must all be
 * the same size and shape regardless of tone, and inheriting a tone API here would let one
 * screen ship a red count in the sidebar and a grey one in the tabs above it.
 */
export function NavItemBadge({ count, active = false }: { count: number; active?: boolean }) {
  const theme = useTheme()

  // Three digits would stretch the rail and force the label to truncate; the exact number
  // stops being actionable well before that anyway.
  const display = count > 99 ? '99+' : String(count)

  return (
    <View
      style={{
        minWidth: theme.spacing[5],
        height: theme.spacing[5],
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: theme.spacing[1.5],
        borderRadius: theme.radius.full,
        backgroundColor: active ? theme.color.primary : theme.color.neutralSubtle,
      }}
    >
      <Text
        variant="caption"
        weight="600"
        numeric
        style={{ color: active ? theme.color.textInverse : theme.color.textMuted }}
      >
        {display}
      </Text>
    </View>
  )
}

/** Unread marker for the collapsed rail, where a count has nowhere to go. */
function NavItemDot({ color }: { color: string }) {
  const theme = useTheme()
  return (
    <View
      style={{
        position: 'absolute',
        top: theme.spacing[1],
        right: theme.spacing[1],
        width: theme.spacing[2],
        height: theme.spacing[2],
        borderRadius: theme.radius.full,
        backgroundColor: color,
      }}
    />
  )
}

export function NavItem({
  label,
  icon,
  active = false,
  onPress,
  badge,
  collapsed = false,
  disabled = false,
  accessibilityLabel,
  style,
  testID,
}: NavItemProps) {
  const theme = useTheme()
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)

  // Matches Button's ring inset exactly, so every focus ring in the system reads as the
  // same object. Expressed from the 1px base token rather than as a bare literal.
  const ringOffset = theme.spacing.px * 3
  const accentWidth = theme.spacing.px * 3
  const hasBadge = typeof badge === 'number' && badge > 0

  return (
    <Pressable
      testID={testID}
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      /*
        `button` rather than `menuitem` or `link`: `menuitem` is only meaningful inside an
        element with a `menu` role, which a persistent sidebar is not, and `link` promises a
        URL that does not exist on native. Selection is carried by accessibilityState
        instead, which every platform announces.
      */
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected: active, disabled }}
      style={({ pressed }) => {
        const visual = resolveVisual(theme, { active, hovered, pressed, disabled })

        const box: ViewStyle = {
          // Full touch target even in the collapsed rail, which is the tablet layout.
          height: theme.layout.minTouchTarget,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'flex-start',
          gap: collapsed ? theme.spacing[0] : theme.spacing[2.5],
          paddingHorizontal: collapsed ? theme.spacing[0] : theme.spacing[3],
          borderRadius: theme.radius.lg,
          backgroundColor: visual.background,
          // React Native's `CursorValue` admits only 'auto' | 'pointer', so a disabled
          // item drops back to the default cursor rather than showing 'not-allowed'.
          cursor: disabled ? 'auto' : 'pointer',
          // Collapsed items are square; expanded ones fill the rail's width.
          ...(collapsed
            ? { width: theme.layout.minTouchTarget }
            : { alignSelf: 'stretch' as const }),
        }

        return [box, style]
      }}
    >
      {({ pressed }) => {
        const visual = resolveVisual(theme, { active, hovered, pressed, disabled })

        return (
          <>
            {/*
              Leading accent bar. Absolutely positioned, so gaining or losing selection
              never changes the row's content box — the labels down the rail stay aligned.
              Inset vertically so it reads as a marker rather than a full-height rule.
            */}
            {active ? (
              <View
                style={{
                  pointerEvents: 'none',
                  position: 'absolute',
                  left: 0,
                  top: theme.spacing[2],
                  bottom: theme.spacing[2],
                  width: accentWidth,
                  borderRadius: theme.radius.full,
                  backgroundColor: theme.color.primary,
                }}
              />
            ) : null}

            {icon !== undefined && icon !== null ? (
              <View
                style={{
                  width: theme.spacing[5],
                  height: theme.spacing[5],
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {typeof icon === 'string' ? (
                  <Text variant="body" style={{ color: visual.content }}>
                    {icon}
                  </Text>
                ) : (
                  icon
                )}
              </View>
            ) : null}

            {collapsed ? null : (
              <>
                <Text
                  variant="bodySm"
                  weight={active ? '600' : '500'}
                  numberOfLines={1}
                  style={{ flex: 1, color: visual.content }}
                >
                  {label}
                </Text>
                {hasBadge ? <NavItemBadge count={badge} active={active} /> : null}
              </>
            )}

            {/*
              Collapsed rails have no room for a count, but silently dropping it would hide
              the fact that something needs attention — the whole reason the count exists.
            */}
            {collapsed && hasBadge ? (
              <NavItemDot color={disabled ? theme.color.textDisabled : theme.color.primary} />
            ) : null}

            {/*
              Focus ring outside the box, never a border: a border would grow the row on
              focus and push every item below it down as the operator tabs through the rail.
            */}
            {focused ? (
              <View
                style={{
                  pointerEvents: 'none',
                  position: 'absolute',
                  top: -ringOffset,
                  left: -ringOffset,
                  right: -ringOffset,
                  bottom: -ringOffset,
                  borderRadius: theme.radius.lg + ringOffset,
                  borderWidth: theme.borderWidth.focus,
                  borderColor: theme.color.borderFocus,
                }}
              />
            ) : null}
          </>
        )
      }}
    </Pressable>
  )
}
