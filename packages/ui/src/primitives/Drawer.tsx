/**
 * Drawer — a panel that slides in from the right edge.
 *
 * Same overlay contract as `Modal` (see that file for why RN's `Modal` is the host, why
 * the scrim and the panel are siblings, and why `onRequestClose` is what makes Escape
 * work without touching `document`). It reuses `DialogHeader` / `DialogBody` /
 * `DialogFooter` from there so the two surfaces cannot drift apart — a drawer that spaced
 * its title differently from a dialog is exactly the kind of small inconsistency that
 * makes a system stop feeling like one.
 *
 * What is genuinely different here:
 *
 *  1. **The slide is animated by hand.** RN's built-in `animationType="slide"` only moves
 *     content up from the bottom, so a right-edge panel has to drive its own transform.
 *     That means the component owns its exit: `visible` on the underlying modal is held
 *     true until the closing animation finishes, otherwise the panel would vanish
 *     instantly on close and only ever animate in one direction.
 *
 *  2. **The easing is read out of the motion token, not retyped as numbers.** The token
 *     is a `cubic-bezier(...)` string because it also has to describe CSS transitions;
 *     parsing it into `Easing.bezier` keeps a single source of truth, so retiming the
 *     system's standard curve retimes this drawer too. Hardcoding `Easing.bezier(0.2, 0,
 *     0, 1)` here would silently fork it.
 *
 *  3. **`useNativeDriver` is platform-conditional.** Transforms and opacity are
 *     driver-eligible on native, but react-native-web has no native animated module and
 *     warns when asked for one. `Platform.OS` is a React Native API, not a web API, so
 *     this stays a single cross-platform code path.
 *
 *  4. **Full width below `md`.** A 480pt panel on a 390pt phone is a modal with a bug in
 *     it; on a phone the drawer takes the whole screen and reads as a pushed page.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  Animated,
  Easing,
  Modal as RNModal,
  Platform,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
  type EasingFunction,
  type StyleProp,
  type ViewStyle,
} from 'react-native'

import { useBreakpoint, useTheme } from '../theme/ThemeProvider'
import { DialogBody, DialogFooter, DialogHeader } from './Modal'

export type DrawerSize = 'sm' | 'md' | 'lg' | 'full'

/**
 * Panel widths, clamped to the viewport at render time so the drawer can never be wider
 * than the screen it is on. `md` is the default and is the 480 in `min(480, screen)`:
 * wide enough for a labelled form, narrow enough that the list behind it stays readable
 * and the user keeps their place. `lg` exists for detail panels that carry a small table.
 */
const PANEL_WIDTH: Record<DrawerSize, number | null> = {
  sm: 360,
  md: 480,
  lg: 560,
  full: null,
}

/**
 * Turn a `cubic-bezier(a, b, c, d)` motion token into an `Easing` function.
 *
 * Falls back to a decelerating curve rather than throwing: a malformed token should cost
 * a slightly different animation, never a crashed dialog.
 */
function easingFromToken(token: string): EasingFunction {
  const inner = /cubic-bezier\(([^)]*)\)/.exec(token)?.[1]
  const parts = inner?.split(',').map((piece) => Number(piece.trim()))

  if (!parts || parts.length !== 4) return Easing.out(Easing.quad)

  const [x1, y1, x2, y2] = parts
  if (
    x1 === undefined ||
    y1 === undefined ||
    x2 === undefined ||
    y2 === undefined ||
    [x1, y1, x2, y2].some(Number.isNaN)
  ) {
    return Easing.out(Easing.quad)
  }

  return Easing.bezier(x1, y1, x2, y2)
}

export type DrawerProps = {
  open: boolean
  /** Called by the close button, the scrim, Escape and Android back. */
  onClose: () => void
  /** Becomes the drawer's accessible name. */
  title?: string
  description?: string
  children?: ReactNode
  /** Action buttons. Right-aligned on desktop, stacked full width on phones. */
  footer?: ReactNode
  size?: DrawerSize
  closeOnBackdropPress?: boolean
  showCloseButton?: boolean
  closeIcon?: ReactNode
  closeAccessibilityLabel?: string
  /** Accessible name. Defaults to `title`; supply it only for a title-less drawer. */
  accessibilityLabel?: string
  /** Escape hatch for the panel only — the scrim is not stylable by design. */
  style?: StyleProp<ViewStyle>
  testID?: string
}

export function Drawer({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  closeOnBackdropPress = true,
  showCloseButton = true,
  closeIcon,
  closeAccessibilityLabel = 'Close',
  accessibilityLabel,
  style,
  testID,
}: DrawerProps) {
  const theme = useTheme()
  const isSmall = useBreakpoint() === 'sm'
  const { width: windowWidth } = useWindowDimensions()

  const configuredWidth = PANEL_WIDTH[size]
  const panelWidth =
    isSmall || configuredWidth === null ? windowWidth : Math.min(configuredWidth, windowWidth)

  /**
   * `mounted` lags `open` on the way out. The host modal has to stay visible for the
   * duration of the exit animation; unmounting on the `open` change would make closing
   * instantaneous while opening animated, which reads as a glitch rather than a style.
   */
  const [mounted, setMounted] = useState(open)
  // 0 = fully off-screen, 1 = fully open. One value drives both the panel transform and
  // the scrim opacity, so they can never desynchronise.
  const progress = useRef(new Animated.Value(0)).current

  const duration = theme.motion.duration.normal
  const easing = useMemo(() => easingFromToken(theme.motion.easing.standard), [
    theme.motion.easing.standard,
  ])

  useEffect(() => {
    if (open) setMounted(true)
  }, [open])

  useEffect(() => {
    if (!mounted) return undefined

    const animation = Animated.timing(progress, {
      toValue: open ? 1 : 0,
      duration,
      easing,
      // Web has no native animated module; asking for one there only produces a warning.
      useNativeDriver: Platform.OS !== 'web',
    })

    animation.start(({ finished }) => {
      if (finished && !open) setMounted(false)
    })

    return () => animation.stop()
  }, [open, mounted, progress, duration, easing])

  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [panelWidth, 0],
  })

  return (
    <RNModal
      visible={mounted}
      transparent
      // The slide is ours; letting the platform animate as well would double the motion.
      animationType="none"
      statusBarTranslucent
      supportedOrientations={['portrait', 'landscape']}
      onRequestClose={onClose}
    >
      <View
        testID={testID}
        style={{
          flex: 1,
          flexDirection: 'row',
          justifyContent: 'flex-end',
          zIndex: theme.zIndex.drawer,
        }}
      >
        {/*
          Scrim. Fades with the same progress value as the panel, and is hidden from
          assistive tech — a full-screen button announced ahead of the drawer's own
          content is noise, and Escape already covers the keyboard path.
        */}
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: progress }]}>
          <Pressable
            style={{ flex: 1 }}
            onPress={closeOnBackdropPress ? onClose : undefined}
            disabled={!closeOnBackdropPress}
            focusable={false}
            accessible={false}
            importantForAccessibility="no-hide-descendants"
          >
            <View
              style={{
                flex: 1,
                backgroundColor: theme.color.overlay,
                cursor: closeOnBackdropPress ? 'pointer' : 'auto',
              }}
            />
          </Pressable>
        </Animated.View>

        {/*
          Panel. A sibling of the scrim, so a press inside it never reaches the scrim's
          handler and the drawer cannot dismiss itself when the user interacts with its
          own content. Edges stay square: three of them sit flush against the screen, and
          rounding the fourth alone would look like a mistake rather than a decision.
        */}
        <Animated.View
          role="dialog"
          aria-modal={true}
          accessibilityViewIsModal
          accessibilityLabel={accessibilityLabel ?? title}
          style={[
            {
              width: panelWidth,
              height: '100%',
              backgroundColor: theme.color.surfaceRaised,
              ...theme.elevation.lg,
              transform: [{ translateX }],
            },
            style,
          ]}
        >
          <DialogHeader
            title={title}
            description={description}
            onClose={onClose}
            showCloseButton={showCloseButton}
            closeIcon={closeIcon}
            closeAccessibilityLabel={closeAccessibilityLabel}
            // A drawer sits beside the page rather than on top of it, so its title is one
            // step down from a dialog's — it is a section heading, not a page interrupt.
            titleVariant="heading"
          />
          <DialogBody>{children}</DialogBody>
          <DialogFooter stacked={isSmall}>{footer}</DialogFooter>
        </Animated.View>
      </View>
    </RNModal>
  )
}
