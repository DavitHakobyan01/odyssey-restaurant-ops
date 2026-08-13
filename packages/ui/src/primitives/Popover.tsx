/**
 * Popover — the positioning primitive every overlay list is built on (Select, MultiSelect,
 * Menu).
 *
 * Why it works the way it does:
 *
 *  1. **`Modal` + `measureInWindow`, not absolute positioning inside the tree.** A panel
 *     rendered as a sibling of its trigger is clipped by any ancestor with `overflow:
 *     hidden` and is fighting for stacking order with every card and table it lives
 *     inside. Rendering into an RN `Modal` escapes the tree entirely, which is the only
 *     approach that behaves identically on native and on react-native-web. `position:
 *     fixed` would have been the web-only shortcut and is deliberately not used.
 *
 *  2. **The anchor is measured, not guessed.** `measureInWindow` gives window-space
 *     coordinates on both platforms (react-native-web implements it via
 *     `getBoundingClientRect`, so it matches the modal's fixed overlay coordinate space).
 *     Measurement happens on open and again on any window resize, and the panel stays
 *     invisible until the first measurement lands so it never flashes at 0,0.
 *
 *  3. **Flipping is a fit decision, not a "which side is bigger" decision.** The panel
 *     only flips when the preferred side cannot show a usable amount of content
 *     (`minTouchTarget * 2`, i.e. roughly two rows). Flipping on the larger-space rule
 *     alone makes panels jump sides on tiny viewport changes, which is far more
 *     disorienting than a slightly shorter list.
 *
 *  4. **Dismissal is uniform.** Backdrop press, Android hardware back and Escape all land
 *     on the same `onRequestClose`. Escape is free: react-native-web's `Modal` listens for
 *     it and calls `onRequestClose`, and on native the same prop is the back button. No
 *     DOM listener is registered by this file.
 *
 *  5. **No scrim by default.** A popover is a lightweight extension of its trigger, so
 *     dimming the page misrepresents it as a modal task. `dimmed` is available for the
 *     rare case where the panel must own the screen.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Modal,
  Pressable,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import type { ReactNode } from 'react'

import { useTheme } from '../theme/ThemeProvider'
import type { Spacing } from '../tokens'

/** Preferred side of the anchor. The panel flips to the other side when it cannot fit. */
export type PopoverSide = 'bottom' | 'top'

/** Which edge of the panel lines up with the matching edge of the anchor. */
export type PopoverAlign = 'start' | 'end'

/** Window-space box of the anchor, as reported by `measureInWindow`. */
export type AnchorRect = { x: number; y: number; width: number; height: number }

export type PopoverRenderState = {
  /** The side the panel actually landed on, after flipping. */
  side: PopoverSide
  /** Pixels of height the panel may use without leaving the viewport. */
  maxHeight: number
  /** Dismiss the popover — handy for content that closes itself. */
  close: () => void
}

export type PopoverProps = {
  open: boolean
  /** Called for backdrop press, Escape (web) and hardware back (Android). */
  onRequestClose: () => void
  /**
   * The trigger. Rendered inline inside a measured wrapper, so callers never have to wire
   * up a ref themselves — a forgotten ref is the classic way a popover ends up at 0,0.
   */
  anchor: ReactNode
  /** Panel content. A function receives the resolved placement, e.g. to cap a list height. */
  children: ReactNode | ((state: PopoverRenderState) => ReactNode)
  side?: PopoverSide
  align?: PopoverAlign
  /**
   * Lock the panel to the anchor's width. Select wants this (a dropdown that is not the
   * width of its field looks broken); a row action menu does not, because it should size
   * to its longest label.
   */
  matchAnchorWidth?: boolean
  /** Floor for the panel width, in pixels. Ignored when `matchAnchorWidth` is set. */
  minWidth?: number
  /** Cap on the panel height. Defaults to whatever fits on the chosen side. */
  maxHeight?: number
  /** Distance between anchor and panel, from the spacing scale. */
  offset?: Spacing
  /**
   * Key handler for the whole overlay (web only — see `webKeyHandlers`).
   *
   * It is deliberately attached to the modal's root container rather than to the panel:
   * react-native-web's focus trap parks initial focus on the first focusable descendant,
   * which may be the backdrop, and a DOM keydown only bubbles through *ancestors*. The
   * root is the one node guaranteed to see every key pressed while the popover is open.
   */
  onKey?: (key: string, event: OverlayKeyEvent) => void
  /** Dim the page behind the panel. Off by default — see the note above. */
  dimmed?: boolean
  /** Stretch the anchor wrapper, so a full-width trigger really is full width. */
  fullWidth?: boolean
  /** Accessible name for the backdrop's dismiss affordance. */
  closeLabel?: string
  anchorStyle?: StyleProp<ViewStyle>
  panelStyle?: StyleProp<ViewStyle>
  testID?: string
}

/* -------------------------------------------------------------------------- */
/*                                  Placement                                  */
/* -------------------------------------------------------------------------- */

type PlacementInput = {
  rect: AnchorRect
  windowSize: { width: number; height: number }
  preferredSide: PopoverSide
  align: PopoverAlign
  /** Gap between anchor and panel. */
  gap: number
  /** Inset kept between the panel and the viewport edge. */
  gutter: number
  /** Smallest height worth showing on a side before flipping is considered. */
  minUsableHeight: number
  matchAnchorWidth: boolean
  minWidth: number | undefined
  maxHeight: number | undefined
}

type Placement = { side: PopoverSide; maxHeight: number; style: ViewStyle }

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max))
}

/**
 * Pure placement maths, kept out of the component so it can be reasoned about (and, later,
 * tested) without mounting anything. Everything it needs is passed in; it reads no theme
 * and no globals.
 */
function resolvePlacement(input: PlacementInput): Placement {
  const { rect, windowSize, preferredSide, align, gap, gutter, minUsableHeight } = input

  const spaceBelow = windowSize.height - (rect.y + rect.height) - gap - gutter
  const spaceAbove = rect.y - gap - gutter

  const preferredSpace = preferredSide === 'bottom' ? spaceBelow : spaceAbove
  const oppositeSpace = preferredSide === 'bottom' ? spaceAbove : spaceBelow

  // Stay on the preferred side unless it is both too small to be useful *and* worse than
  // the alternative. See note 3 in the file header.
  const side: PopoverSide =
    preferredSpace >= minUsableHeight || preferredSpace >= oppositeSpace
      ? preferredSide
      : preferredSide === 'bottom'
        ? 'top'
        : 'bottom'

  const available = Math.max(side === 'bottom' ? spaceBelow : spaceAbove, minUsableHeight)
  const maxHeight = input.maxHeight === undefined ? available : Math.min(input.maxHeight, available)

  const vertical: ViewStyle =
    side === 'bottom'
      ? { top: rect.y + rect.height + gap }
      : { bottom: windowSize.height - rect.y + gap }

  const usableWidth = Math.max(windowSize.width - gutter * 2, 0)

  if (input.matchAnchorWidth) {
    const width = Math.min(rect.width, usableWidth)
    return {
      side,
      maxHeight,
      style: {
        ...vertical,
        width,
        left: clamp(rect.x, gutter, windowSize.width - gutter - width),
        maxHeight,
      },
    }
  }

  const horizontal: ViewStyle =
    align === 'end'
      ? { right: clamp(windowSize.width - (rect.x + rect.width), gutter, windowSize.width - gutter) }
      : { left: clamp(rect.x, gutter, windowSize.width - gutter) }

  // A panel narrower than the control that opened it always looks like a mistake, so the
  // anchor's width is a floor even when the panel is free to size to its content.
  const minWidth = Math.min(Math.max(rect.width, input.minWidth ?? 0), usableWidth)

  return {
    side,
    maxHeight,
    style: {
      ...vertical,
      ...horizontal,
      maxWidth: usableWidth,
      minWidth,
      maxHeight,
    },
  }
}

/* -------------------------------------------------------------------------- */
/*                                  Component                                  */
/* -------------------------------------------------------------------------- */

export function Popover({
  open,
  onRequestClose,
  anchor,
  children,
  side = 'bottom',
  align = 'start',
  matchAnchorWidth = false,
  minWidth,
  maxHeight,
  offset = 1.5,
  onKey,
  dimmed = false,
  fullWidth = false,
  closeLabel = 'Close',
  anchorStyle,
  panelStyle,
  testID,
}: PopoverProps) {
  const theme = useTheme()
  const anchorRef = useRef<View>(null)
  const { width: windowWidth, height: windowHeight } = useWindowDimensions()
  const [rect, setRect] = useState<AnchorRect | null>(null)

  const measure = useCallback(() => {
    const node = anchorRef.current
    if (!node) return
    node.measureInWindow((x, y, width, height) => {
      // A detached or not-yet-laid-out node reports zeros or NaN on some platforms;
      // keeping the previous rect is better than snapping the panel to the corner.
      if (!Number.isFinite(x) || !Number.isFinite(y) || width === 0) return
      setRect({ x, y, width, height })
    })
  }, [])

  useEffect(() => {
    if (!open) {
      // Drop the stale rect so the next open re-measures. Without this a trigger that has
      // scrolled since the last open would show its panel at the old position for a frame.
      setRect(null)
      return
    }
    measure()
  }, [open, measure, windowWidth, windowHeight])

  const placement =
    rect === null
      ? null
      : resolvePlacement({
          rect,
          windowSize: { width: windowWidth, height: windowHeight },
          preferredSide: side,
          align,
          gap: theme.spacing[offset],
          gutter: theme.spacing[2],
          // Two rows' worth of height is the least that justifies staying on a side.
          minUsableHeight: theme.layout.minTouchTarget * 2,
          matchAnchorWidth,
          minWidth,
          maxHeight,
        })

  return (
    <>
      <View
        ref={anchorRef}
        // Android flattens plain wrapper Views out of the hierarchy; a flattened view has
        // no node to measure, which silently breaks positioning on device only.
        collapsable={false}
        onLayout={open ? measure : undefined}
        style={[fullWidth ? { alignSelf: 'stretch' } : { alignSelf: 'flex-start' }, anchorStyle]}
      >
        {anchor}
      </View>

      <Modal
        visible={open}
        transparent
        // The panel is positioned from a fresh measurement every time; animating it would
        // mean animating from a position that was correct one layout pass ago.
        animationType="none"
        // Both bars translucent so the modal's coordinate space is the same window space
        // `measureInWindow` reports against on Android. Without this the panel sits one
        // status-bar height too low.
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={onRequestClose}
      >
        <View
          {...(onKey ? webKeyHandlers(onKey) : {})}
          style={{ flex: 1, zIndex: theme.zIndex.popover }}
          testID={testID}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={closeLabel}
            onPress={onRequestClose}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: dimmed ? theme.color.overlay : 'transparent',
            }}
          />

          {placement === null ? null : (
            <View
              accessibilityViewIsModal
              style={[
                {
                  position: 'absolute',
                  backgroundColor: theme.color.surfaceRaised,
                  borderRadius: theme.radius.xl,
                  borderWidth: theme.borderWidth.hairline,
                  borderColor: theme.color.border,
                  ...theme.elevation.md,
                },
                placement.style,
                panelStyle,
              ]}
            >
              {/*
                Clipping lives on an inner view: on iOS `overflow: 'hidden'` on the same
                view that carries a shadow erases the shadow, so the two responsibilities
                have to be separated.
              */}
              <View style={{ borderRadius: theme.radius.xl, overflow: 'hidden' }}>
                {typeof children === 'function'
                  ? children({ side: placement.side, maxHeight: placement.maxHeight, close: onRequestClose })
                  : children}
              </View>
            </View>
          )}
        </View>
      </Modal>
    </>
  )
}

/* -------------------------------------------------------------------------- */
/*                          Shared overlay behaviour                           */
/* -------------------------------------------------------------------------- */

/**
 * The subset of a keyboard event both platforms can agree on.
 *
 * React Native's own types have no keyboard event for views because native views do not
 * receive one; react-native-web forwards the DOM event unchanged. Describing only the
 * three fields we use keeps the call sites honest about how little is guaranteed.
 */
export type OverlayKeyEvent = {
  key?: string
  nativeEvent?: { key?: string }
  preventDefault?: () => void
}

/**
 * Keyboard wiring for overlay content.
 *
 * react-native-web forwards `onKeyDown` (not `onKeyPress`, which it does not support on
 * View/Pressable) and native ignores the unknown prop entirely, so the same JSX runs on
 * both platforms and keyboard support simply does not exist where there is no keyboard.
 * The cast is unavoidable: the prop is real at runtime on web but absent from RN's types.
 */
export function webKeyHandlers(
  handler: (key: string, event: OverlayKeyEvent) => void,
): { onKeyDown: (event: OverlayKeyEvent) => void } {
  return {
    onKeyDown: (event: OverlayKeyEvent) => {
      const key = event.key ?? event.nativeEvent?.key
      if (key !== undefined) handler(key, event)
    },
  }
}

/**
 * Move a roving "active row" index by one step, skipping disabled rows and wrapping.
 *
 * Lives beside Popover because every overlay list built on it (Select, MultiSelect, Menu)
 * needs exactly this, and a shared implementation is the only way ArrowDown behaves the
 * same in all of them. Returns `current` when no row is selectable, so a list of entirely
 * disabled items cannot spin forever.
 */
export function stepActiveIndex(
  current: number,
  delta: 1 | -1,
  length: number,
  isDisabled: (index: number) => boolean,
): number {
  if (length === 0) return -1
  let next = current
  for (let i = 0; i < length; i += 1) {
    next = (next + delta + length) % length
    if (!isDisabled(next)) return next
  }
  return current
}
