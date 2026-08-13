/**
 * Tabs — horizontal, single-select section switcher.
 *
 * Interaction follows Button: five explicit states per tab, hover through `Pressable`,
 * and a focus ring drawn outside the box so tabbing through the strip never reflows it.
 *
 * The parts that are not obvious:
 *
 *  1. **The indicator is one shared bar, not a border on the active tab.** A per-tab
 *     border cannot animate between tabs, and it also changes the tab's height when it
 *     appears. A single absolutely-positioned bar slides, and costs no layout at all.
 *
 *  2. **Positions come from `onLayout`, not from measuring text.** Tab widths depend on
 *     the platform's font metrics, so they can only be known after layout. Each tab
 *     reports its own box; the indicator reads the entry for the selected key.
 *
 *  3. **The first placement jumps, every later one animates.** Sliding in from x=0 on
 *     mount would be a piece of motion that communicates nothing, so the very first
 *     measurement is written straight to the animated values.
 *
 *  4. **The animation runs on the JS driver on purpose.** `width` is a layout property and
 *     cannot be driven natively. Driving `scaleX` instead would qualify, but a scaled bar
 *     needs a base width to scale from and produces uneven ends mid-flight; for a 200ms
 *     move of a 2px bar the JS driver is the simpler correct answer.
 *
 *  5. **Arrow keys both move focus and select** (ARIA "automatic activation"). Tabs here
 *     switch a rendered section with no expensive fetch behind it, so requiring a second
 *     Enter press would only add a keystroke to every navigation.
 *
 *  6. **There is no disabled tab.** A section an operator is not allowed to open should
 *     not be listed at all — a greyed-out tab advertises a destination while refusing it.
 *     The remaining four states (rest, hover, pressed, focus) are all explicit below.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Animated,
  Easing,
  Pressable,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native'

import { useTheme } from '../theme/ThemeProvider'
import { NavItemBadge } from './NavItem'
import { Text } from './Text'

export type TabItem = {
  /** Stable identity. This is what `value` and `onChange` speak in. */
  key: string
  label: string
  /** Count shown after the label — open orders, unresolved issues. */
  badge?: number
}

export type TabsProps = {
  items: TabItem[]
  /** Key of the selected tab. Controlled: the parent owns selection. */
  value: string
  onChange: (key: string) => void
  /** Divide the full width between tabs. Used when tabs span a card or a phone screen. */
  fullWidth?: boolean
  /** Accessible name for the tab strip, e.g. "Order status". */
  accessibilityLabel?: string
  style?: StyleProp<ViewStyle>
  testID?: string
}

/**
 * `onKeyDown` is how react-native-web surfaces DOM key events; React Native's own typings
 * omit it because native Views have no keyboard event. Declaring the shape locally keeps
 * the handler typed without importing from `react-native-web` (which would break the
 * native build) and without `any`. On native the prop is simply unknown and ignored.
 */
type WebKeyEvent = { key?: string; preventDefault?: () => void }
type WebKeyboardProps = { onKeyDown?: (event: WebKeyEvent) => void }

type TabMetrics = { x: number; width: number }

export function Tabs({
  items,
  value,
  onChange,
  fullWidth = false,
  accessibilityLabel,
  style,
  testID,
}: TabsProps) {
  const theme = useTheme()
  const [hoveredKey, setHoveredKey] = useState<string | null>(null)
  const [focusedKey, setFocusedKey] = useState<string | null>(null)

  const indicatorX = useRef(new Animated.Value(0)).current
  const indicatorWidth = useRef(new Animated.Value(0)).current

  // Layout results live in a ref, not in state: they are read by the animation, never
  // rendered, and putting them in state would re-render the whole strip on every measure.
  const metrics = useRef<Record<string, TabMetrics | undefined>>({})
  const placed = useRef(false)

  // Refs are how arrow keys move focus. `View` carries `focus()` on every platform;
  // on web react-native-web forwards it to the DOM node.
  const tabRefs = useRef<Record<string, View | null>>({})

  const duration = theme.motion.duration.normal

  const syncIndicator = useCallback(
    (animated: boolean) => {
      const target = metrics.current[value]
      if (!target) return

      if (!animated) {
        indicatorX.setValue(target.x)
        indicatorWidth.setValue(target.width)
        return
      }

      Animated.parallel([
        Animated.timing(indicatorX, {
          toValue: target.x,
          duration,
          // `motion.easing.standard` is a CSS cubic-bezier string, which Animated cannot
          // consume; this is its runtime equivalent — fast out, settled end.
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
        Animated.timing(indicatorWidth, {
          toValue: target.width,
          duration,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
      ]).start()
    },
    [value, duration, indicatorX, indicatorWidth],
  )

  // Selection changed from outside (or from a press): slide to the new tab. Layout for the
  // target may not exist yet on first render, in which case `onLayout` places it instead.
  useEffect(() => {
    syncIndicator(placed.current)
  }, [syncIndicator])

  const handleTabLayout = (key: string) => (event: LayoutChangeEvent) => {
    const { x, width } = event.nativeEvent.layout
    metrics.current[key] = { x, width }

    if (key !== value) return
    syncIndicator(placed.current)
    placed.current = true
  }

  /** Arrow keys wrap around the strip, Home/End jump to the ends. */
  const moveSelection = (fromIndex: number, delta: number) => {
    if (items.length === 0) return
    const nextIndex = (fromIndex + delta + items.length) % items.length
    const next = items[nextIndex]
    if (!next) return

    onChange(next.key)
    // Focus follows selection, otherwise the next arrow press would move from the old tab.
    tabRefs.current[next.key]?.focus()
  }

  const jumpTo = (index: number) => {
    const target = items[index]
    if (!target) return
    onChange(target.key)
    tabRefs.current[target.key]?.focus()
  }

  const ringOffset = theme.spacing.px * 3

  return (
    <View
      testID={testID}
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'stretch',
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
          // The rule under the whole strip is what makes the indicator read as a position
          // along a track rather than as a floating underline.
          borderBottomWidth: theme.borderWidth.hairline,
          borderBottomColor: theme.color.border,
        },
        style,
      ]}
    >
      {items.map((item, index) => {
        const selected = item.key === value
        const hovered = hoveredKey === item.key
        const focused = focusedKey === item.key

        const keyboard: WebKeyboardProps = {
          onKeyDown: (event) => {
            if (event.key === 'ArrowRight') {
              event.preventDefault?.()
              moveSelection(index, 1)
            } else if (event.key === 'ArrowLeft') {
              event.preventDefault?.()
              moveSelection(index, -1)
            } else if (event.key === 'Home') {
              event.preventDefault?.()
              jumpTo(0)
            } else if (event.key === 'End') {
              event.preventDefault?.()
              jumpTo(items.length - 1)
            }
          },
        }

        const labelColor = selected
          ? theme.color.primaryText
          : hovered
            ? theme.color.text
            : theme.color.textMuted

        return (
          <Pressable
            key={item.key}
            ref={(node) => {
              tabRefs.current[item.key] = node
            }}
            testID={testID ? `${testID}-${item.key}` : undefined}
            onLayout={handleTabLayout(item.key)}
            onPress={() => onChange(item.key)}
            onHoverIn={() => setHoveredKey(item.key)}
            onHoverOut={() => setHoveredKey((current) => (current === item.key ? null : current))}
            onFocus={() => setFocusedKey(item.key)}
            onBlur={() => setFocusedKey((current) => (current === item.key ? null : current))}
            {...keyboard}
            accessibilityRole="tab"
            accessibilityLabel={item.label}
            accessibilityState={{ selected }}
            style={({ pressed }) => ({
              // Tabs are tappable, so they get the full touch target even though the text
              // needs far less room.
              height: theme.layout.minTouchTarget,
              ...(fullWidth ? { flex: 1 } : {}),
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: theme.spacing[1.5],
              paddingHorizontal: theme.spacing[3],
              // Only the top corners round: the bottom edge sits on the track.
              borderTopLeftRadius: theme.radius.md,
              borderTopRightRadius: theme.radius.md,
              backgroundColor: pressed
                ? theme.color.surfaceActive
                : hovered
                  ? theme.color.surfaceHover
                  : 'transparent',
              cursor: 'pointer',
            })}
          >
            <Text variant="bodySm" weight={selected ? '600' : '500'} numberOfLines={1} style={{ color: labelColor }}>
              {item.label}
            </Text>

            {typeof item.badge === 'number' && item.badge > 0 ? (
              <NavItemBadge count={item.badge} active={selected} />
            ) : null}

            {focused ? (
              <View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  top: -ringOffset,
                  left: -ringOffset,
                  right: -ringOffset,
                  bottom: -ringOffset,
                  borderRadius: theme.radius.md + ringOffset,
                  borderWidth: theme.borderWidth.focus,
                  borderColor: theme.color.borderFocus,
                }}
              />
            ) : null}
          </Pressable>
        )
      })}

      {/*
        The sliding indicator. Pulled down by one hairline so it covers the track rather
        than stacking on top of it, which would otherwise read as a 3px-thick rule.
      */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          bottom: -theme.borderWidth.hairline,
          left: indicatorX,
          width: indicatorWidth,
          height: theme.borderWidth.thick,
          borderRadius: theme.radius.full,
          backgroundColor: theme.color.primary,
        }}
      />
    </View>
  )
}
