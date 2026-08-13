/**
 * Select and MultiSelect — single- and multi-value dropdowns built on `Popover`.
 *
 * Decisions worth knowing about before changing anything here:
 *
 *  1. **The trigger is a field, not a button.** It uses the control metrics every form
 *     control in this system shares (`FIELD_SIZE` below: the same heights as `Button`, the
 *     same `radius.lg`, the same hairline border), so a row that mixes an Input and a
 *     Select lines up on both edges. This is the single most common place a design system
 *     looks sloppy, and it is only avoided by both components reading the same spec.
 *
 *  2. **Generic over the value.** `Select<T extends string>` means a caller passing
 *     `OrderStatus` gets `onChange(value: OrderStatus)` — no casting at the call site, and
 *     a typo in an option value is a compile error rather than a silent no-op filter.
 *
 *  3. **Keyboard focus follows the active option.** Arrow keys move `activeIndex`, and an
 *     effect moves real DOM focus onto that row. Doing it this way (instead of tracking a
 *     purely visual highlight) means Enter and Space are handled by the focused
 *     `Pressable` itself on react-native-web, screen readers announce the row the user is
 *     on, and there is exactly one source of truth for "which option is current".
 *
 *  4. **Enter is handled at the list level only when no row owns focus.** react-native-web
 *     already turns Enter/Space on a focused Pressable into `onPress`; handling it a
 *     second time would select twice — harmless for Select, but a toggle-then-untoggle
 *     no-op for MultiSelect. See `handleListKey`.
 *
 *  5. **Indicators are drawn from Views, not an icon font.** The system ships no icon
 *     dependency, and a check/chevron is two bordered boxes. Both are sized purely from
 *     spacing tokens so they scale with the rest of the scale rather than drifting.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Pressable,
  ScrollView,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native'

import { webCursor } from '../theme/platform'
import { useTheme } from '../theme/ThemeProvider'
import type { Theme } from '../tokens'
import { Popover, stepActiveIndex, webKeyHandlers, type OverlayKeyEvent } from './Popover'
import { Text } from './Text'

export type SelectSize = 'sm' | 'md' | 'lg'

export type SelectOption<T extends string> = {
  label: string
  value: T
  /** Secondary line under the label — used to explain a status or a rarely used choice. */
  description?: string
  disabled?: boolean
}

export type SelectProps<T extends string> = {
  /** The selected value. `null`/`undefined` shows the placeholder. */
  value?: T | null
  onChange: (value: T) => void
  options: ReadonlyArray<SelectOption<T>>
  placeholder?: string
  disabled?: boolean
  /** Failed validation. Renders the danger border the Input uses for the same state. */
  invalid?: boolean
  size?: SelectSize
  fullWidth?: boolean
  /** Accessible name. Supply this when the visible label sits outside the control. */
  accessibilityLabel?: string
  style?: StyleProp<ViewStyle>
  testID?: string
}

export type MultiSelectProps<T extends string> = {
  value: ReadonlyArray<T>
  onChange: (value: T[]) => void
  options: ReadonlyArray<SelectOption<T>>
  placeholder?: string
  disabled?: boolean
  invalid?: boolean
  size?: SelectSize
  fullWidth?: boolean
  /** Overrides the "N selected" summary — e.g. to say "3 statuses". */
  summaryLabel?: (count: number) => string
  accessibilityLabel?: string
  style?: StyleProp<ViewStyle>
  testID?: string
}

/* -------------------------------------------------------------------------- */
/*                              Control metrics                                */
/* -------------------------------------------------------------------------- */

/**
 * The shared form-control spec.
 *
 * Heights match `Button`'s `SIZE_SPEC` exactly so that a toolbar of Buttons, Inputs and
 * Selects has one baseline. Horizontal padding is one step tighter than Button's, because
 * a field's text reads as content that should sit close to its border, where a button's
 * label is a target that wants air around it.
 */
const FIELD_SIZE = {
  sm: { height: 32, paddingH: 2.5, gap: 2, variant: 'bodySm' },
  md: { height: 38, paddingH: 3, gap: 2, variant: 'bodySm' },
  lg: { height: 46, paddingH: 4, gap: 2, variant: 'body' },
} as const

/**
 * `not-allowed` is a genuine CSS cursor that react-native-web forwards untouched, but
 * React Native's `CursorValue` only names the two cursors it implements natively
 * (`'auto' | 'pointer'`). This is a gap in the types rather than in the platforms — native
 * ignores the property entirely — so the value is asserted once here instead of being
 * dropped or repeated as an inline cast at every call site.
 */
const CURSOR_NOT_ALLOWED = 'not-allowed' as unknown as ViewStyle['cursor']

type FieldVisual = { background: string; border: string; text: string }

/**
 * Colour triple for the trigger in a given interaction state.
 *
 * Single switch-free function for the same reason `Button.resolveVisual` is one function:
 * the state matrix is small enough to read at a glance, and a missing state is obvious.
 * Hover deliberately changes only the border — a field that also changes fill on hover
 * reads as pressed, and would no longer match a plain Input sitting next to it.
 */
function resolveFieldVisual(
  theme: Theme,
  state: { hovered: boolean; pressed: boolean; open: boolean; disabled: boolean; invalid: boolean },
): FieldVisual {
  if (state.disabled) {
    return {
      background: theme.color.surfaceDisabled,
      border: theme.color.border,
      text: theme.color.textDisabled,
    }
  }

  return {
    background: state.pressed ? theme.color.surfaceHover : theme.color.surface,
    border: state.invalid
      ? theme.color.danger
      : state.open
        ? theme.color.borderFocus
        : state.hovered
          ? theme.color.borderStrong
          : theme.color.border,
    text: theme.color.text,
  }
}

/* -------------------------------------------------------------------------- */
/*                                 Indicators                                  */
/* -------------------------------------------------------------------------- */

/** Disclosure caret. A rotated box with two borders — no icon dependency required. */
function Chevron({ color, up }: { color: string; up: boolean }) {
  const theme = useTheme()
  return (
    <View
      style={{
        width: theme.spacing[3],
        height: theme.spacing[3],
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          width: theme.spacing[1.5],
          height: theme.spacing[1.5],
          borderRightWidth: theme.borderWidth.thick,
          borderBottomWidth: theme.borderWidth.thick,
          borderColor: color,
          // The rotated square's optical centre is below its geometric one; nudging by the
          // smallest spacing step re-centres it in the box.
          marginTop: up ? theme.spacing[0.5] : -theme.spacing[0.5],
          transform: [{ rotate: up ? '225deg' : '45deg' }],
        }}
      />
    </View>
  )
}

/** Selection check. Same construction as the caret, rotated to a tick. */
function CheckMark({ color }: { color: string }) {
  const theme = useTheme()
  return (
    <View
      style={{
        width: theme.spacing[4],
        height: theme.spacing[4],
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          width: theme.spacing[1.5],
          height: theme.spacing[2.5],
          borderRightWidth: theme.borderWidth.thick,
          borderBottomWidth: theme.borderWidth.thick,
          borderColor: color,
          marginTop: -theme.spacing[0.5],
          transform: [{ rotate: '45deg' }],
        }}
      />
    </View>
  )
}

/* -------------------------------------------------------------------------- */
/*                                   Trigger                                   */
/* -------------------------------------------------------------------------- */

type SelectTriggerProps = {
  text: string
  /** The text is the placeholder rather than a value, so it renders in a quieter tone. */
  isPlaceholder: boolean
  open: boolean
  disabled: boolean
  invalid: boolean
  size: SelectSize
  fullWidth: boolean
  onPress: () => void
  onKey: (key: string, event: OverlayKeyEvent) => void
  accessibilityLabel?: string
  testID?: string
}

function SelectTrigger({
  text,
  isPlaceholder,
  open,
  disabled,
  invalid,
  size,
  fullWidth,
  onPress,
  onKey,
  accessibilityLabel,
  testID,
}: SelectTriggerProps) {
  const theme = useTheme()
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)

  const spec = FIELD_SIZE[size]
  // Small fields are shorter than the minimum touch target, so the difference is given
  // back as hit slop: the control looks like an Input but is still thumb-sized.
  const slop = Math.max(0, (theme.layout.minTouchTarget - spec.height) / 2)

  return (
    <Pressable
      {...webKeyHandlers(onKey)}
      testID={testID}
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      hitSlop={{ top: slop, bottom: slop, left: 0, right: 0 }}
      accessibilityRole="combobox"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled, expanded: open }}
      style={({ pressed }) => {
        const visual = resolveFieldVisual(theme, { hovered, pressed, open, disabled, invalid })
        return {
          height: spec.height,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing[spec.gap],
          paddingHorizontal: theme.spacing[spec.paddingH],
          borderRadius: theme.radius.lg,
          borderWidth: theme.borderWidth.hairline,
          backgroundColor: visual.background,
          borderColor: visual.border,
          opacity: disabled ? 0.7 : 1,
          ...webCursor(disabled ? 'not-allowed' : 'pointer'),
        }
      }}
    >
      {({ pressed }) => {
        const visual = resolveFieldVisual(theme, { hovered, pressed, open, disabled, invalid })
        return (
          <>
            <View style={{ flex: 1 }}>
              <Text
                variant={spec.variant}
                numberOfLines={1}
                style={{
                  color: disabled
                    ? theme.color.textDisabled
                    : isPlaceholder
                      ? theme.color.textSubtle
                      : visual.text,
                }}
              >
                {text}
              </Text>
            </View>

            <Chevron color={disabled ? theme.color.textDisabled : theme.color.textMuted} up={open} />

            {/*
              Focus ring drawn outside the box, exactly as Button does it. A border or an
              extra border-width here would change the field's height on focus and shift
              every control in the form row.
            */}
            {focused ? (
              <View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  top: -3,
                  left: -3,
                  right: -3,
                  bottom: -3,
                  borderRadius: theme.radius.lg + 3,
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

/* -------------------------------------------------------------------------- */
/*                                 Option list                                 */
/* -------------------------------------------------------------------------- */

type OptionRowProps = {
  label: string
  description: string | undefined
  selected: boolean
  /** Keyboard/pointer highlight. Distinct from `selected`, which is the stored value. */
  active: boolean
  disabled: boolean
  size: SelectSize
  onPress: () => void
  onHoverIn: () => void
  onFocus: () => void
  onBlur: () => void
  rowRef: (node: View | null) => void
  testID?: string
}

function OptionRow({
  label,
  description,
  selected,
  active,
  disabled,
  size,
  onPress,
  onHoverIn,
  onFocus,
  onBlur,
  rowRef,
  testID,
}: OptionRowProps) {
  const theme = useTheme()
  const [hovered, setHovered] = useState(false)
  const spec = FIELD_SIZE[size]

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
      accessibilityState={{ disabled, selected }}
      style={({ pressed }) => ({
        // Rows are full-width targets and always clear the minimum touch target, so no hit
        // slop is needed here — unlike the trigger, which is constrained to field height.
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
            ? theme.color.surfaceActive
            : hovered || active
              ? theme.color.surfaceHover
              : 'transparent',
        ...webCursor(disabled ? 'not-allowed' : 'pointer'),
      })}
    >
      <View style={{ flex: 1 }}>
        <Text
          variant={spec.variant}
          weight={selected ? '500' : '400'}
          numberOfLines={1}
          style={{ color: disabled ? theme.color.textDisabled : theme.color.text }}
        >
          {label}
        </Text>
        {description === undefined ? null : (
          <Text variant="caption" tone={disabled ? 'disabled' : 'muted'} numberOfLines={2}>
            {description}
          </Text>
        )}
      </View>

      {/*
        The indicator column is reserved whether or not the row is selected, so labels do
        not shift sideways as the selection moves down the list.
      */}
      {selected ? (
        <CheckMark color={disabled ? theme.color.textDisabled : theme.color.primary} />
      ) : (
        <View style={{ width: theme.spacing[4], height: theme.spacing[4] }} />
      )}
    </Pressable>
  )
}

type OptionListProps<T extends string> = {
  options: ReadonlyArray<SelectOption<T>>
  isSelected: (option: SelectOption<T>) => boolean
  activeIndex: number
  maxHeight: number
  size: SelectSize
  emptyLabel: string
  onActivate: (index: number) => void
  onChoose: (index: number) => void
  onRowFocusChange: (index: number) => void
  testID?: string
}

function OptionList<T extends string>({
  options,
  isSelected,
  activeIndex,
  maxHeight,
  size,
  emptyLabel,
  onActivate,
  onChoose,
  onRowFocusChange,
  testID,
}: OptionListProps<T>) {
  const theme = useTheme()
  const rowRefs = useRef<Array<View | null>>([])

  // Moving real focus (rather than only a highlight) is what lets the focused Pressable
  // handle Enter/Space itself and lets a screen reader announce the current option. This
  // component only mounts once the panel has been positioned, so the mount run of this
  // effect is also what focuses the initially-active row.
  useEffect(() => {
    if (activeIndex < 0) return
    rowRefs.current[activeIndex]?.focus()
  }, [activeIndex])

  const padding = theme.spacing[1]

  if (options.length === 0) {
    return (
      <View style={{ padding: theme.spacing[3] }}>
        <Text variant="bodySm" tone="muted">
          {emptyLabel}
        </Text>
      </View>
    )
  }

  return (
    <ScrollView
      testID={testID}
      // The panel is already capped by Popover; the same cap is applied to the scroller so
      // it has a bounded height to scroll within on both platforms.
      style={{ maxHeight: Math.max(maxHeight - padding * 2, theme.layout.minTouchTarget) }}
      contentContainerStyle={{ padding }}
      keyboardShouldPersistTaps="handled"
    >
      {options.map((option, index) => (
        <OptionRow
          key={option.value}
          label={option.label}
          description={option.description}
          selected={isSelected(option)}
          active={index === activeIndex}
          disabled={option.disabled === true}
          size={size}
          onPress={() => onChoose(index)}
          onHoverIn={() => onActivate(index)}
          onFocus={() => onRowFocusChange(index)}
          onBlur={() => onRowFocusChange(-1)}
          rowRef={(node) => {
            rowRefs.current[index] = node
          }}
          testID={testID ? `${testID}-option-${option.value}` : undefined}
        />
      ))}
    </ScrollView>
  )
}

/* -------------------------------------------------------------------------- */
/*                            Shared list keyboarding                          */
/* -------------------------------------------------------------------------- */

type ListKeyConfig = {
  length: number
  isDisabled: (index: number) => boolean
  activeIndex: number
  /** -1 when no row currently holds focus. */
  focusedIndex: number
  setActiveIndex: (next: number) => void
  choose: (index: number) => void
  close: () => void
}

/**
 * ArrowUp/ArrowDown/Home/End/Enter/Escape for an open option list.
 *
 * Shared by Select and MultiSelect so the two cannot drift. Enter is only handled when no
 * row holds focus — see note 4 in the file header.
 */
function handleListKey(key: string, event: OverlayKeyEvent, config: ListKeyConfig): void {
  const { length, isDisabled, activeIndex, focusedIndex, setActiveIndex, choose, close } = config

  switch (key) {
    case 'ArrowDown':
    case 'ArrowUp': {
      event.preventDefault?.()
      setActiveIndex(stepActiveIndex(activeIndex, key === 'ArrowDown' ? 1 : -1, length, isDisabled))
      return
    }
    case 'Home': {
      event.preventDefault?.()
      setActiveIndex(stepActiveIndex(-1, 1, length, isDisabled))
      return
    }
    case 'End': {
      event.preventDefault?.()
      setActiveIndex(stepActiveIndex(0, -1, length, isDisabled))
      return
    }
    case 'Enter':
    case ' ': {
      if (focusedIndex !== -1) return
      event.preventDefault?.()
      choose(activeIndex)
      return
    }
    case 'Escape': {
      close()
      return
    }
    default:
  }
}

/* -------------------------------------------------------------------------- */
/*                                   Select                                    */
/* -------------------------------------------------------------------------- */

export function Select<T extends string>({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  disabled = false,
  invalid = false,
  size = 'md',
  fullWidth = false,
  accessibilityLabel,
  style,
  testID,
}: SelectProps<T>) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [focusedIndex, setFocusedIndex] = useState(-1)

  const selectedIndex = options.findIndex((option) => option.value === value)
  const selected = selectedIndex === -1 ? undefined : options[selectedIndex]

  const isDisabled = useCallback(
    (index: number) => options[index]?.disabled === true,
    [options],
  )

  const close = useCallback(() => {
    setOpen(false)
    setFocusedIndex(-1)
  }, [])

  const openList = useCallback(() => {
    if (disabled) return
    // Open on the current value when there is one; otherwise on the first choosable
    // option, so the very first ArrowDown moves rather than jumping from nowhere.
    setActiveIndex(
      selectedIndex !== -1 && !isDisabled(selectedIndex)
        ? selectedIndex
        : stepActiveIndex(-1, 1, options.length, isDisabled),
    )
    setFocusedIndex(-1)
    setOpen(true)
  }, [disabled, isDisabled, options.length, selectedIndex])

  const choose = useCallback(
    (index: number) => {
      const option = options[index]
      if (!option || option.disabled === true) return
      onChange(option.value)
      close()
    },
    [close, onChange, options],
  )

  return (
    <Popover
      open={open}
      onRequestClose={close}
      onKey={(key, event) =>
        handleListKey(key, event, {
          length: options.length,
          isDisabled,
          activeIndex,
          focusedIndex,
          setActiveIndex,
          choose,
          close,
        })
      }
      matchAnchorWidth
      fullWidth={fullWidth}
      anchorStyle={style}
      closeLabel="Close the options list"
      anchor={
        <SelectTrigger
          text={selected ? selected.label : placeholder}
          isPlaceholder={selected === undefined}
          open={open}
          disabled={disabled}
          invalid={invalid}
          size={size}
          fullWidth={fullWidth}
          onPress={() => (open ? close() : openList())}
          onKey={(key, event) => {
            if (key !== 'ArrowDown' && key !== 'ArrowUp') return
            // Enter and Space are intentionally not handled: react-native-web already
            // turns them into onPress on a focused Pressable.
            event.preventDefault?.()
            openList()
          }}
          accessibilityLabel={accessibilityLabel}
          testID={testID}
        />
      }
    >
      {({ maxHeight }) => (
        <OptionList
          options={options}
          isSelected={(option) => option.value === value}
          activeIndex={activeIndex}
          maxHeight={maxHeight}
          size={size}
          emptyLabel="No options"
          onActivate={setActiveIndex}
          onChoose={choose}
          onRowFocusChange={setFocusedIndex}
          testID={testID ? `${testID}-list` : undefined}
        />
      )}
    </Popover>
  )
}

/* -------------------------------------------------------------------------- */
/*                                 MultiSelect                                 */
/* -------------------------------------------------------------------------- */

/**
 * Multi-value variant, built for filter bars (the Orders status filter is the driving
 * case).
 *
 * Two behavioural differences from `Select`, both deliberate:
 *  - Choosing an option toggles it and **keeps the panel open**, because filtering is
 *    almost always a multi-step action and reopening the list each time is hostile.
 *  - The trigger summarises. One selection shows its label (more informative than
 *    "1 selected"); more than one collapses to "N selected", because a filter chip that
 *    grows with the selection makes the whole toolbar reflow.
 */
export function MultiSelect<T extends string>({
  value,
  onChange,
  options,
  placeholder = 'All',
  disabled = false,
  invalid = false,
  size = 'md',
  fullWidth = false,
  summaryLabel,
  accessibilityLabel,
  style,
  testID,
}: MultiSelectProps<T>) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [focusedIndex, setFocusedIndex] = useState(-1)

  const isDisabled = useCallback(
    (index: number) => options[index]?.disabled === true,
    [options],
  )

  const close = useCallback(() => {
    setOpen(false)
    setFocusedIndex(-1)
  }, [])

  const openList = useCallback(() => {
    if (disabled) return
    const firstSelected = options.findIndex((option) => value.includes(option.value))
    setActiveIndex(
      firstSelected !== -1 && !isDisabled(firstSelected)
        ? firstSelected
        : stepActiveIndex(-1, 1, options.length, isDisabled),
    )
    setFocusedIndex(-1)
    setOpen(true)
  }, [disabled, isDisabled, options, value])

  const toggle = useCallback(
    (index: number) => {
      const option = options[index]
      if (!option || option.disabled === true) return
      const next = value.includes(option.value)
        ? value.filter((current) => current !== option.value)
        : [...value, option.value]
      onChange(next)
    },
    [onChange, options, value],
  )

  const selectedLabel = (): string => {
    if (value.length === 0) return placeholder
    if (summaryLabel) return summaryLabel(value.length)
    if (value.length === 1) {
      const only = options.find((option) => option.value === value[0])
      if (only) return only.label
    }
    return `${value.length} selected`
  }

  return (
    <Popover
      open={open}
      onRequestClose={close}
      onKey={(key, event) =>
        handleListKey(key, event, {
          length: options.length,
          isDisabled,
          activeIndex,
          focusedIndex,
          setActiveIndex,
          choose: toggle,
          close,
        })
      }
      matchAnchorWidth
      fullWidth={fullWidth}
      anchorStyle={style}
      closeLabel="Close the options list"
      anchor={
        <SelectTrigger
          text={selectedLabel()}
          isPlaceholder={value.length === 0}
          open={open}
          disabled={disabled}
          invalid={invalid}
          size={size}
          fullWidth={fullWidth}
          onPress={() => (open ? close() : openList())}
          onKey={(key, event) => {
            if (key !== 'ArrowDown' && key !== 'ArrowUp') return
            event.preventDefault?.()
            openList()
          }}
          accessibilityLabel={accessibilityLabel}
          testID={testID}
        />
      }
    >
      {({ maxHeight }) => (
        <OptionList
          options={options}
          isSelected={(option) => value.includes(option.value)}
          activeIndex={activeIndex}
          maxHeight={maxHeight}
          size={size}
          emptyLabel="No options"
          onActivate={setActiveIndex}
          onChoose={toggle}
          onRowFocusChange={setFocusedIndex}
          testID={testID ? `${testID}-list` : undefined}
        />
      )}
    </Popover>
  )
}
