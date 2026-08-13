/**
 * Toast — transient confirmations, and the queue that manages them.
 *
 * Three pieces live here: `ToastProvider` (owns the queue and renders the viewport),
 * `useToast()` (the imperative API a screen calls), and `Toast` (the presentational
 * component, exported so it can be rendered standalone in a storybook or a test).
 *
 * The decisions that are not obvious from the code:
 *
 *  1. **Danger toasts never auto-dismiss.** Every tone but `danger` disappears after
 *     `duration`. An error that the operator did not read is strictly worse than a toast
 *     that lingers: the failure is invisible, the work silently did not happen, and there
 *     is no history to scroll back through. So `danger` waits for an explicit dismiss.
 *
 *  2. **The dismiss timer pauses on hover.** A pointer resting on a toast means someone
 *     is reading it. When the pointer leaves, the countdown *restarts* rather than
 *     resuming its remaining time — the forgiving choice, and it avoids storing a
 *     remaining-time value that drifts every time the component re-renders.
 *
 *  3. **Timers belong to the toast, not the provider.** Each item's `setTimeout` lives in
 *     its own effect, so unmounting the item — or the whole provider on a route change —
 *     clears it through the normal effect cleanup. A timer owned by the provider and keyed
 *     by id is the classic source of "setState on an unmounted component" in this pattern.
 *
 *  4. **New toasts are appended, never prepended.** Combined with the viewport's growth
 *     direction (downward from the top on desktop, upward from the bottom on a phone),
 *     existing toasts never move when a new one arrives. A toast that shifts under the
 *     pointer is a mis-click waiting to happen — and the thing being clicked is usually
 *     "Undo".
 *
 *  5. **No portal.** React Native has none, so the provider wraps its children in a
 *     `flex: 1` view and overlays an absolutely-positioned viewport as a sibling. That is
 *     also why `position: 'fixed'` is not used: it does not exist on native.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  Animated,
  Easing,
  Pressable,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import type { ReactNode } from 'react'

import { useBreakpoint, useTheme } from '../theme/ThemeProvider'
import { toneColors, type Tone } from '../tokens'
import { Text } from './Text'

/* -------------------------------------------------------------------------- */
/*                                    Types                                    */
/* -------------------------------------------------------------------------- */

export type ToastOptions = {
  title: string
  description?: string
  tone?: Tone
  /**
   * Milliseconds before auto-dismiss. `0` pins the toast until it is dismissed
   * explicitly. Ignored for tone `danger`, which is always pinned.
   */
  duration?: number
  /** Usually an "Undo" or "View" `Button`. A node, so this file needs no button API. */
  action?: ReactNode
}

/** A queued toast: the caller's options with defaults resolved and an id attached. */
export type ToastRecord = {
  id: string
  title: string
  description?: string
  tone: Tone
  duration: number
  action?: ReactNode
}

export type ToastContextValue = {
  /** Enqueue a toast. Returns its id, which can be passed to `dismiss`. */
  toast: (options: ToastOptions) => string
  success: (title: string, description?: string) => string
  /** Shorthand for tone `danger` — and therefore for a toast that will not auto-dismiss. */
  error: (title: string, description?: string) => string
  /** Dismiss one toast, or all of them when called with no id. */
  dismiss: (id?: string) => void
}

/** Long enough to read two lines, short enough not to stack up during a busy shift. */
const DEFAULT_DURATION = 4500

/**
 * Beyond four, the stack covers real content and nobody reads the bottom one anyway.
 * The oldest are dropped rather than the newest: the most recent event is the one the
 * operator is currently trying to understand.
 */
const DEFAULT_MAX_VISIBLE = 4

const ToastContext = createContext<ToastContextValue | null>(null)

/* -------------------------------------------------------------------------- */
/*                                   Provider                                  */
/* -------------------------------------------------------------------------- */

export type ToastProviderProps = {
  children: ReactNode
  /** Default auto-dismiss delay for tones other than `danger`. */
  duration?: number
  maxVisible?: number
  testID?: string
}

export function ToastProvider({
  children,
  duration = DEFAULT_DURATION,
  maxVisible = DEFAULT_MAX_VISIBLE,
  testID,
}: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastRecord[]>([])

  // A counter, not `Date.now()` or `Math.random()`: two toasts fired in the same tick
  // must not collide, and a stable sequence makes ids readable in tests.
  const nextId = useRef(0)

  const dismiss = useCallback((id?: string) => {
    setToasts((previous) => (id === undefined ? [] : previous.filter((item) => item.id !== id)))
  }, [])

  const toast = useCallback(
    (options: ToastOptions) => {
      nextId.current += 1
      const id = `toast-${nextId.current}`

      const record: ToastRecord = {
        id,
        title: options.title,
        description: options.description,
        action: options.action,
        tone: options.tone ?? 'neutral',
        duration: options.duration ?? duration,
      }

      setToasts((previous) => [...previous, record].slice(-maxVisible))
      return id
    },
    [duration, maxVisible],
  )

  const success = useCallback(
    (title: string, description?: string) => toast({ title, description, tone: 'success' }),
    [toast],
  )

  const error = useCallback(
    (title: string, description?: string) => toast({ title, description, tone: 'danger' }),
    [toast],
  )

  const value = useMemo<ToastContextValue>(
    () => ({ toast, success, error, dismiss }),
    [toast, success, error, dismiss],
  )

  return (
    <ToastContext.Provider value={value}>
      <View style={{ flex: 1 }} testID={testID}>
        {children}
        {/*
          The viewport is a separate component so that the window-size subscription in
          `useBreakpoint()` lives there. Reading it here would re-render the entire
          application subtree on every frame of a window resize.
        */}
        <ToastViewport toasts={toasts} onDismiss={dismiss} />
      </View>
    </ToastContext.Provider>
  )
}

/**
 * The imperative API.
 *
 * Throws outside a provider, matching `useTheme()`: a silently no-op `toast()` would mean
 * failures are reported nowhere, which is the exact bug this component exists to prevent.
 */
export function useToast(): ToastContextValue {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast() must be used inside <ToastProvider>. Wrap your app root in it.')
  }
  return context
}

/* -------------------------------------------------------------------------- */
/*                                   Viewport                                  */
/* -------------------------------------------------------------------------- */

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: ToastRecord[]
  onDismiss: (id: string) => void
}) {
  const theme = useTheme()
  // Phones get a full-width stack at the bottom, in reach of a thumb and clear of the
  // status bar. Everything larger gets a top-right column, out of the way of the table
  // the operator is working in.
  const compact = useBreakpoint() === 'sm'

  if (toasts.length === 0) return null

  return (
    <View
      // `box-none` lets presses fall through the empty area of the viewport to the app
      // underneath; without it the whole corner of the screen becomes dead to touch.
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        right: 0,
        ...(compact ? { left: 0, bottom: 0 } : { top: 0 }),
        // Growth direction is what keeps existing toasts stationary as new ones arrive:
        // the oldest stays pinned against the screen edge in both layouts.
        flexDirection: compact ? 'column-reverse' : 'column',
        alignItems: compact ? 'stretch' : 'flex-end',
        gap: theme.spacing[2],
        padding: theme.spacing[compact ? 3 : 4],
        zIndex: theme.zIndex.toast,
      }}
    >
      {toasts.map((record) => (
        <ToastItem key={record.id} record={record} compact={compact} onDismiss={onDismiss} />
      ))}
    </View>
  )
}

/* -------------------------------------------------------------------------- */
/*                                  Toast item                                 */
/* -------------------------------------------------------------------------- */

/** True when this toast must wait for an explicit dismiss. See decision 1 at the top. */
function isPinned(record: ToastRecord): boolean {
  return record.tone === 'danger' || record.duration <= 0
}

function ToastItem({
  record,
  compact,
  onDismiss,
}: {
  record: ToastRecord
  compact: boolean
  onDismiss: (id: string) => void
}) {
  const theme = useTheme()
  const [hovered, setHovered] = useState(false)

  // 0 -> 1 drives both the fade and the slide, so the two can never desynchronise.
  const enter = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const animation = Animated.timing(enter, {
      toValue: 1,
      duration: theme.motion.duration.normal,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    })
    animation.start()
    // Stopping on unmount matters as much as clearing a timer: an in-flight animation
    // holds a frame callback that would otherwise keep running against a dead node.
    return () => animation.stop()
  }, [enter, theme.motion.duration.normal])

  useEffect(() => {
    if (isPinned(record) || hovered) return

    const timer = setTimeout(() => onDismiss(record.id), record.duration)
    return () => clearTimeout(timer)
    // `hovered` in the dependency list is what implements pause-on-hover: the cleanup
    // clears the pending timer on hover-in and the effect starts a fresh one on hover-out.
  }, [hovered, record, onDismiss])

  const offset = enter.interpolate({
    inputRange: [0, 1],
    // Slides in from the nearest screen edge — up from the bottom on a phone, in from
    // the right on desktop — so the motion reads as "arriving from off-screen".
    outputRange: [compact ? theme.spacing[6] : theme.spacing[8], 0],
  })

  return (
    <Animated.View
      style={{
        alignSelf: compact ? 'stretch' : 'flex-end',
        opacity: enter,
        transform: compact ? [{ translateY: offset }] : [{ translateX: offset }],
      }}
    >
      <Toast
        title={record.title}
        description={record.description}
        tone={record.tone}
        action={record.action}
        fullWidth={compact}
        onDismiss={() => onDismiss(record.id)}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        testID={`toast-${record.tone}`}
      />
    </Animated.View>
  )
}

/* -------------------------------------------------------------------------- */
/*                              Presentational toast                           */
/* -------------------------------------------------------------------------- */

export type ToastProps = {
  title: string
  description?: string
  tone?: Tone
  action?: ReactNode
  onDismiss?: () => void
  /** Phone layout: fill the viewport width instead of sitting in a fixed column. */
  fullWidth?: boolean
  /** Wired by `ToastProvider` to pause the auto-dismiss countdown. */
  onHoverIn?: () => void
  onHoverOut?: () => void
  style?: StyleProp<ViewStyle>
  testID?: string
}

export function Toast({
  title,
  description,
  tone = 'neutral',
  action,
  onDismiss,
  fullWidth = false,
  onHoverIn,
  onHoverOut,
  style,
  testID,
}: ToastProps) {
  const theme = useTheme()
  const colors = toneColors(theme, tone)

  return (
    <Pressable
      testID={testID}
      // A Pressable with no `onPress`: it is here for `onHoverIn`/`onHoverOut`, which is
      // how this system reads hover on both platforms. Native simply never fires them.
      onHoverIn={onHoverIn}
      onHoverOut={onHoverOut}
      accessibilityRole="alert"
      accessibilityLiveRegion={tone === 'danger' ? 'assertive' : 'polite'}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: theme.spacing[3],
          paddingVertical: theme.spacing[3],
          paddingLeft: theme.spacing[4],
          paddingRight: theme.spacing[2],
          borderRadius: theme.radius.xl,
          borderWidth: theme.borderWidth.hairline,
          borderColor: colors.border,
          // Opaque, unlike `Alert`: a toast floats over arbitrary content, so the tinted
          // `colors.background` would let whatever is underneath bleed through it.
          backgroundColor: theme.color.surfaceRaised,
          overflow: 'hidden',
          // The toast column reuses the sidebar's measure rather than inventing a second
          // arbitrary width for the product. On a phone it stretches instead.
          ...(fullWidth
            ? { alignSelf: 'stretch' }
            : { width: theme.layout.sidebarWidth, maxWidth: '100%' }),
          ...theme.elevation.lg,
        },
        style,
      ]}
    >
      {/*
        The tone is carried by this rail and the border, not by the title colour: the
        neutral tone's text token is the same value as the muted body colour, so a
        tone-coloured title would make neutral toasts read as one flat grey block.
      */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: theme.spacing[1],
          backgroundColor: colors.solid,
        }}
      />

      <View style={{ flex: 1, gap: theme.spacing[1] }}>
        <Text variant="bodyMedium">{title}</Text>

        {description ? (
          <Text variant="bodySm" tone="muted">
            {description}
          </Text>
        ) : null}

        {action ? <View style={{ paddingTop: theme.spacing[1] }}>{action}</View> : null}
      </View>

      {onDismiss ? <ToastDismissButton onPress={onDismiss} /> : null}
    </Pressable>
  )
}

/**
 * Close control for a toast.
 *
 * Neutral hover colours here (unlike `Alert`'s tone-tinted ones) because the toast sits
 * on `surfaceRaised`, where the surface hover tokens are exactly right.
 *
 * The visual box is 28px; `hitSlop` widens the touch target to the 44px minimum so the
 * toast stays compact without becoming impossible to close on a phone.
 */
function ToastDismissButton({ onPress }: { onPress: () => void }) {
  const theme = useTheme()
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)

  const box = theme.spacing[7]
  const slop = Math.max(0, Math.round((theme.layout.minTouchTarget - box) / 2))

  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      hitSlop={slop}
      accessibilityRole="button"
      accessibilityLabel="Dismiss notification"
      style={({ pressed }) => ({
        width: box,
        height: box,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: theme.radius.md,
        backgroundColor: pressed
          ? theme.color.surfaceActive
          : hovered
            ? theme.color.surfaceHover
            : 'transparent',
        cursor: 'pointer',
      })}
    >
      {({ pressed }) => (
        <>
          <Text variant="body" weight="500" tone={pressed || hovered ? 'default' : 'muted'}>
            {'×'}
          </Text>

          {/* Outside the box, so focusing the control cannot resize the toast. */}
          {focused ? (
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: -3,
                left: -3,
                right: -3,
                bottom: -3,
                borderRadius: theme.radius.md + 3,
                borderWidth: theme.borderWidth.focus,
                borderColor: theme.color.borderFocus,
              }}
            />
          ) : null}
        </>
      )}
    </Pressable>
  )
}
