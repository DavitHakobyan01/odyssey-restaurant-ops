/**
 * Menu — the row/toolbar action menu, built on `Popover`.
 *
 * Design notes:
 *
 *  1. **The caller owns the trigger.** `trigger` is a render prop receiving `{ open,
 *     toggle }` rather than a `ReactNode` we wrap in our own Pressable. Wrapping would
 *     nest one pressable inside another — two focus stops, two hover surfaces, and a
 *     button that reports the wrong accessibility role. This way a row menu is just an
 *     `IconButton` whose `onPress` is `toggle`.
 *
 *  2. **Tone comes from the shared vocabulary.** An item's `tone` is the same `Tone` union
 *     Badge, Alert and Toast use, resolved through `toneColors()`. A destructive item is
 *     `tone="danger"` — never a colour — so "delete is red" is decided once, in the theme.
 *
 *  3. **Items are actions, not state.** There is no selected item and no check column;
 *     pressing one runs its handler and closes the menu. A menu that stays open after an
 *     action reads as a filter, which is what `MultiSelect` is for.
 *
 *  4. **Rows are full touch targets.** Each item is at least `layout.minTouchTarget` tall
 *     even at the smallest text size, because this is the control people hit at arm's
 *     length on a tablet in a service station.
 *
 *  5. **Keyboard support mirrors Select** — Arrow keys move focus onto the active row,
 *     Enter runs it (handled by the focused Pressable itself on react-native-web), Escape
 *     closes. On native these never fire and the menu is purely pointer-driven.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Pressable, ScrollView, View, type StyleProp, type ViewStyle } from 'react-native'
import type { ReactNode } from 'react'

import { webCursor } from '../theme/platform'
import { useTheme } from '../theme/ThemeProvider'
import { toneColors, type Tone } from '../tokens'
import {
  Popover,
  stepActiveIndex,
  type OverlayKeyEvent,
  type PopoverAlign,
  type PopoverSide,
} from './Popover'
import { Text } from './Text'

export type MenuItem = {
  label: string
  onPress: () => void
  /** Semantic emphasis — `danger` for destructive actions. Omit for ordinary items. */
  tone?: Tone
  /** Leading glyph. A `ReactNode` because this package ships no icon dependency. */
  icon?: ReactNode
  disabled?: boolean
}

export type MenuProps = {
  items: ReadonlyArray<MenuItem>
  /**
   * Renders the control that opens the menu. Receives the open state (so the trigger can
   * stay visually active while the menu is up) and a toggle callback.
   */
  trigger: (state: { open: boolean; toggle: () => void }) => ReactNode
  /** Right-align the panel with the trigger. The right default suits row action menus,
   *  which live at the end of a table row where a left-aligned panel would overflow. */
  align?: PopoverAlign
  side?: PopoverSide
  /** Controlled open state. Omit to let the menu manage its own. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** Accessible name for the menu surface itself. */
  accessibilityLabel?: string
  style?: StyleProp<ViewStyle>
  testID?: string
}

/* -------------------------------------------------------------------------- */
/*                                  Menu row                                   */
/* -------------------------------------------------------------------------- */

type MenuRowProps = {
  item: MenuItem
  active: boolean
  onPress: () => void
  onHoverIn: () => void
  onFocus: () => void
  onBlur: () => void
  rowRef: (node: View | null) => void
  testID?: string
}

function MenuRow({ item, active, onPress, onHoverIn, onFocus, onBlur, rowRef, testID }: MenuRowProps) {
  const theme = useTheme()
  const [hovered, setHovered] = useState(false)

  const disabled = item.disabled === true
  const tone = item.tone === undefined ? undefined : toneColors(theme, item.tone)

  // An untoned item is ordinary text on the neutral hover surface. A toned one borrows its
  // own subtle surface, which is what makes a destructive item read as destructive the
  // moment the pointer touches it rather than only after it has been pressed.
  const label = disabled ? theme.color.textDisabled : (tone?.text ?? theme.color.text)
  const highlight = tone?.background ?? theme.color.surfaceHover

  return (
    <Pressable
      ref={rowRef}
      testID={testID}
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      onHoverIn={() => {
        setHovered(true)
        onHoverIn()
      }}
      onHoverOut={() => setHovered(false)}
      onFocus={onFocus}
      onBlur={onBlur}
      accessibilityRole="menuitem"
      accessibilityLabel={item.label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => ({
        minHeight: theme.layout.minTouchTarget,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing[2],
        paddingHorizontal: theme.spacing[3],
        paddingVertical: theme.spacing[1.5],
        borderRadius: theme.radius.md,
        backgroundColor: disabled
          ? 'transparent'
          : pressed
            ? (tone?.background ?? theme.color.surfaceActive)
            : hovered || active
              ? highlight
              : 'transparent',
        opacity: disabled ? 0.7 : 1,
        ...webCursor(disabled ? 'not-allowed' : 'pointer'),
      })}
    >
      {item.icon === undefined ? null : (
        <View
          style={{
            width: theme.spacing[4],
            height: theme.spacing[4],
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {item.icon}
        </View>
      )}
      <Text variant="bodySm" numberOfLines={1} style={{ color: label }}>
        {item.label}
      </Text>
    </Pressable>
  )
}

/* -------------------------------------------------------------------------- */
/*                                    Menu                                     */
/* -------------------------------------------------------------------------- */

type MenuListProps = {
  items: ReadonlyArray<MenuItem>
  activeIndex: number
  maxHeight: number
  onActivate: (index: number) => void
  onRun: (index: number) => void
  onRowFocusChange: (index: number) => void
  accessibilityLabel?: string
  testID?: string
}

function MenuList({
  items,
  activeIndex,
  maxHeight,
  onActivate,
  onRun,
  onRowFocusChange,
  accessibilityLabel,
  testID,
}: MenuListProps) {
  const theme = useTheme()
  const rowRefs = useRef<Array<View | null>>([])

  // Mirrors Select: the highlight *is* focus, so Enter is handled by the focused row and
  // assistive technology announces the item the user is actually on. This list mounts only
  // once the panel has been placed, so the mount run focuses the initially-active row.
  useEffect(() => {
    if (activeIndex < 0) return
    rowRefs.current[activeIndex]?.focus()
  }, [activeIndex])

  const padding = theme.spacing[1]

  return (
    <ScrollView
      testID={testID}
      accessibilityRole="menu"
      accessibilityLabel={accessibilityLabel}
      style={{ maxHeight: Math.max(maxHeight - padding * 2, theme.layout.minTouchTarget) }}
      contentContainerStyle={{ padding }}
      keyboardShouldPersistTaps="handled"
    >
      {items.map((item, index) => (
        <MenuRow
          // Labels are the natural identity here, but two items may legitimately share one
          // (e.g. two "Print" entries in different groups), so the index disambiguates.
          key={`${index}-${item.label}`}
          item={item}
          active={index === activeIndex}
          onPress={() => onRun(index)}
          onHoverIn={() => onActivate(index)}
          onFocus={() => onRowFocusChange(index)}
          onBlur={() => onRowFocusChange(-1)}
          rowRef={(node) => {
            rowRefs.current[index] = node
          }}
          testID={testID ? `${testID}-item-${index}` : undefined}
        />
      ))}
    </ScrollView>
  )
}

export function Menu({
  items,
  trigger,
  align = 'end',
  side = 'bottom',
  open: controlledOpen,
  onOpenChange,
  accessibilityLabel = 'Actions',
  style,
  testID,
}: MenuProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [focusedIndex, setFocusedIndex] = useState(-1)

  // Controlled when the caller passes `open`; self-managed otherwise. Keeping both in one
  // component avoids a second `ControlledMenu` that would inevitably drift in behaviour.
  const open = controlledOpen ?? uncontrolledOpen

  const setOpen = useCallback(
    (next: boolean) => {
      if (controlledOpen === undefined) setUncontrolledOpen(next)
      onOpenChange?.(next)
    },
    [controlledOpen, onOpenChange],
  )

  const isDisabled = useCallback((index: number) => items[index]?.disabled === true, [items])

  const close = useCallback(() => {
    setOpen(false)
    setFocusedIndex(-1)
  }, [setOpen])

  const toggle = useCallback(() => {
    if (open) {
      close()
      return
    }
    setActiveIndex(stepActiveIndex(-1, 1, items.length, isDisabled))
    setFocusedIndex(-1)
    setOpen(true)
  }, [close, isDisabled, items.length, open, setOpen])

  const run = useCallback(
    (index: number) => {
      const item = items[index]
      if (!item || item.disabled === true) return
      // Close first: the handler usually opens a dialog or navigates, and an overlay that
      // is still mounted underneath would trap focus behind the new surface.
      close()
      item.onPress()
    },
    [close, items],
  )

  const handleKey = useCallback(
    (key: string, event: OverlayKeyEvent) => {
      switch (key) {
        case 'ArrowDown':
        case 'ArrowUp': {
          event.preventDefault?.()
          setActiveIndex((current) =>
            stepActiveIndex(current, key === 'ArrowDown' ? 1 : -1, items.length, isDisabled),
          )
          return
        }
        case 'Home': {
          event.preventDefault?.()
          setActiveIndex(stepActiveIndex(-1, 1, items.length, isDisabled))
          return
        }
        case 'End': {
          event.preventDefault?.()
          setActiveIndex(stepActiveIndex(0, -1, items.length, isDisabled))
          return
        }
        case 'Enter':
        case ' ': {
          // A focused row activates itself on react-native-web; running it here as well
          // would fire the action twice.
          if (focusedIndex !== -1) return
          event.preventDefault?.()
          run(activeIndex)
          return
        }
        case 'Escape': {
          close()
          return
        }
        default:
      }
    },
    [activeIndex, close, focusedIndex, isDisabled, items.length, run],
  )

  return (
    <Popover
      open={open}
      onRequestClose={close}
      onKey={handleKey}
      side={side}
      align={align}
      anchorStyle={style}
      closeLabel="Close the actions menu"
      anchor={trigger({ open, toggle })}
    >
      {({ maxHeight }) => (
        <MenuList
          items={items}
          activeIndex={activeIndex}
          maxHeight={maxHeight}
          onActivate={setActiveIndex}
          onRun={run}
          onRowFocusChange={setFocusedIndex}
          accessibilityLabel={accessibilityLabel}
          testID={testID ? `${testID}-list` : undefined}
        />
      )}
    </Popover>
  )
}
