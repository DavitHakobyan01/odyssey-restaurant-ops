/**
 * Breadcrumbs — the trail back up from the current page.
 *
 * Decisions a reviewer should not have to reverse-engineer:
 *
 *  1. **The last item is never pressable.** It is the page you are on, so a press would
 *     be a no-op that still looked like a control. It is also the only crumb rendered in
 *     full-strength text; the ancestors are muted, which makes the trail scannable
 *     backwards without any separator styling doing the work.
 *
 *  2. **Crumbs are 24px tall but a 44px touch target.** Making the row itself 44px tall
 *     would leave a band of dead space above a page title that is already the tallest
 *     element on the screen. `hitSlop` grows the touchable area outward without adding a
 *     single pixel of layout, and the slop is derived from `layout.minTouchTarget` so the
 *     two can never drift apart.
 *
 *  3. **The separator is drawn, not typed.** A rotated View with two hairline borders
 *     gives an identical chevron on every platform and takes its colour from the theme.
 *     A "›" character would be rendered by whatever font the OS picked and sits on a
 *     different baseline on each one.
 *
 *  4. **"Disabled" is not a state here.** A crumb with no `onPress` renders as text
 *     rather than as a dead control — a greyed-out trail entry tells the operator nothing
 *     actionable. The other four states are all present on the pressable crumbs.
 */
import { useState } from 'react'
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native'

import { useTheme } from '../theme/ThemeProvider'
import { Text } from './Text'

export type BreadcrumbItem = {
  label: string
  /** Omit on ancestors that are not navigable. The final item never receives one. */
  onPress?: () => void
}

export type BreadcrumbsProps = {
  /** Root first, current page last. */
  items: BreadcrumbItem[]
  style?: StyleProp<ViewStyle>
  testID?: string
}

/** Decorative chevron. Hidden from assistive tech — it carries no information a label does not. */
function Chevron() {
  const theme = useTheme()
  const size = theme.spacing[1.5]

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        borderRightWidth: theme.borderWidth.hairline,
        borderTopWidth: theme.borderWidth.hairline,
        borderColor: theme.color.textSubtle,
        transform: [{ rotate: '45deg' }],
      }}
    />
  )
}

function Crumb({ item, testID }: { item: BreadcrumbItem & { onPress: () => void }; testID?: string }) {
  const theme = useTheme()
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)

  const ringOffset = theme.spacing.px * 3
  const height = theme.spacing[6]
  // Grow the touchable box out to the platform minimum without changing the visual box.
  const slopY = Math.max(0, (theme.layout.minTouchTarget - height) / 2)

  return (
    <Pressable
      testID={testID}
      onPress={item.onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      hitSlop={{ top: slopY, bottom: slopY, left: theme.spacing[1], right: theme.spacing[1] }}
      /* `link` rather than `button`: a crumb navigates, it does not act on the page. */
      accessibilityRole="link"
      accessibilityLabel={item.label}
      style={({ pressed }) => ({
        height,
        justifyContent: 'center',
        paddingHorizontal: theme.spacing[1],
        borderRadius: theme.radius.sm,
        backgroundColor: pressed
          ? theme.color.surfaceActive
          : hovered
            ? theme.color.surfaceHover
            : 'transparent',
        cursor: 'pointer',
      })}
    >
      <Text
        variant="bodySm"
        numberOfLines={1}
        style={{ color: hovered ? theme.color.text : theme.color.textMuted }}
      >
        {item.label}
      </Text>

      {/* Ring outside the box — a border would nudge the rest of the trail sideways. */}
      {focused ? (
        <View
          style={{
            pointerEvents: 'none',
            position: 'absolute',
            top: -ringOffset,
            left: -ringOffset,
            right: -ringOffset,
            bottom: -ringOffset,
            borderRadius: theme.radius.sm + ringOffset,
            borderWidth: theme.borderWidth.focus,
            borderColor: theme.color.borderFocus,
          }}
        />
      ) : null}
    </Pressable>
  )
}

export function Breadcrumbs({ items, style, testID }: BreadcrumbsProps) {
  const theme = useTheme()

  if (items.length === 0) return null

  return (
    <View
      testID={testID}
      accessibilityRole="list"
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          // Long trails wrap on a phone instead of pushing the page into horizontal scroll.
          flexWrap: 'wrap',
          gap: theme.spacing[1.5],
        },
        style,
      ]}
    >
      {items.map((item, index) => {
        const isLast = index === items.length - 1

        return (
          <View
            key={`${item.label}-${index}`}
            style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[1.5] }}
          >
            {index > 0 ? <Chevron /> : null}

            {isLast || !item.onPress ? (
              /*
                The current page. Wrapped in an `accessible` View with an explicit label
                because React Native exposes no `aria-current`; folding "current page" into
                the accessible name is the only cross-platform way to say it out loud.
              */
              <View
                accessible
                accessibilityRole="text"
                accessibilityLabel={isLast ? `${item.label}, current page` : item.label}
                style={{ height: theme.spacing[6], justifyContent: 'center' }}
              >
                <Text
                  variant="bodySm"
                  weight={isLast ? '600' : '400'}
                  tone={isLast ? 'default' : 'muted'}
                  numberOfLines={1}
                >
                  {item.label}
                </Text>
              </View>
            ) : (
              <Crumb
                item={{ label: item.label, onPress: item.onPress }}
                testID={testID ? `${testID}-${index}` : undefined}
              />
            )}
          </View>
        )
      })}
    </View>
  )
}
