/**
 * Select and MultiSelect — single- and multi-value dropdowns built on `Popover`.
 *
 * Decisions worth knowing about before changing anything here:
 *
 *  1. **The trigger is an Input, not a button.** It does not merely look like one: it
 *     imports `INPUT_SIZE_SPEC`, `resolveInputSurface` and `InputFocusRing` from
 *     `Input.tsx` and renders the same box. Height, radius, padding, border colour per
 *     state and focus ring are therefore identical by construction, which is the only way
 *     a form row mixing an Input and a Select stays flush — copying the numbers here would
 *     drift the first time either file was touched.
 *
 *  2. **It participates in `Field`.** `disabled` and `invalid` fall back to the
 *     surrounding Field exactly as Input's do (explicit props still win), and the control
 *     picks up the Field's id, label association and hint. A Select inside a Field
 *     behaves like every other control in that form without the caller wiring anything.
 *
 *  3. **Generic over the value.** `Select<T extends string>` means a caller passing
 *     `OrderStatus` gets `onChange(value: OrderStatus)` — no casting at the call site, and
 *     a typo in an option value is a compile error rather than a silently dead filter.
 *
 *  4. **Keyboard focus follows the active option.** Arrow keys move `activeIndex`, and an
 *     effect moves real focus onto that row. Doing it this way (rather than tracking a
 *     purely visual highlight) means Enter and Space are handled by the focused
 *     `Pressable` itself on react-native-web, a screen reader announces the row the user
 *     is on, and there is exactly one source of truth for "which option is current".
 *
 *  5. **Enter is handled at list level only when no row owns focus.** react-native-web
 *     already turns Enter/Space on a focused Pressable into `onPress`; handling it again
 *     would choose twice — harmless for Select, but a toggle-then-untoggle no-op for
 *     MultiSelect. See `handleListKey`.
 *
 *  6. **Indicators are drawn from Views, not an icon font.** The package ships no icon
 *     dependency, and a caret or a tick is one bordered box rotated 45°. Both are sized
 *     from spacing tokens so they scale with the rest of the system.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Pressable, ScrollView, View, type StyleProp, type ViewStyle } from 'react-native'

import { webCursor } from '../theme/platform'
import { useTheme } from '../theme/ThemeProvider'
import { useField } from './Field'
import {
  INPUT_SIZE_SPEC,
  InputFocusRing,
  resolveInputSurface,
  type InputSize,
} from './Input'
import { Popover, stepActiveIndex, webKeyHandlers, type OverlayKeyEvent } from './Popover'
import { Text } from './Text'

/** Aliased rather than redeclared: a Select is a field, and fields share one size scale. */
export type SelectSize = InputSize

export type SelectOption<T extends string> = {
  label: string
  value: T
  /** Secondary line under the label — used to explain a status or a rare choice. */
  description?: string
  disabled?: boolean
}

export type SelectProps<T extends string> = {
  /** The selected value. `null`/`undefined` shows the placeholder. */
  value?: T | null
  onChange: (value: T) => void
  options: ReadonlyArray<SelectOption<T>>
  placeholder?: string
  /** Falls back to the surrounding Field's disabled state. */
  disabled?: boolean
  /** Falls back to the surrounding Field showing an error. */
  invalid?: boolean
  size?: SelectSize
  /**
   * Stretch to fill the row. Defaults to true because Input always stretches and a Select
   * beside one must too; pass false for a filter-bar Select that should hug its label.
   */
  fullWidth?: boolean
  /**
   * Accessible name for a Select used without a Field wrapper (a toolbar filter).
   * Inside a Field the label is associated automatically and this can be omitted.
   */
  accessibilityLabel?: string
  /** Shown in the panel when `options` is empty. */
  emptyLabel?: string
  /** Styles the outer box, not the panel. */
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
  emptyLabel?: string
  style?: StyleProp<ViewStyle>
  testID?: string
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
          // A rotated square's optical centre sits below its geometric one; the smallest
          // spacing step re-centres it inside the box.
          marginTop: up ? theme.spacing[0.5] : -theme.spacing[0.5],
          transform: [{ rotate: up ? '225deg' : '45deg' }],
        }}
      />
    </View>
  )
}

/** Selection tick. Same construction as the caret, with a longer trailing stroke. */
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
  const field = useField()
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)

  const spec = INPUT_SIZE_SPEC[size]

  return (
    <Pressable
      {...webKeyHandlers(onKey)}
      testID={testID}
      nativeID={field?.controlId}
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      accessibilityRole="combobox"
      accessibilityLabel={accessibilityLabel}
      accessibilityLabelledBy={field?.labelId}
      accessibilityHint={field?.description}
      // `expanded` is what tells a screen-reader user that this control owns a list and
      // whether that list is currently showing.
      accessibilityState={{ disabled, expanded: open }}
      accessibilityValue={isPlaceholder ? undefined : { text }}
      style={({ pressed }) => {
        // While the panel is open the field is, to the user, focused — even though on web
        // the DOM focus has moved into the modal. Passing `open` as `focused` is what keeps
        // the border teal for the whole interaction instead of dropping back to grey.
        const surface = resolveInputSurface(theme, {
          hovered,
          pressed,
          focused: focused || open,
          disabled,
          invalid,
        })

        return {
          height: spec.height,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing[spec.gap],
          paddingHorizontal: theme.spacing[spec.paddingH],
          borderRadius: theme.radius.lg,
          borderWidth: theme.borderWidth.hairline,
          borderColor: surface.border,
          backgroundColor: surface.background,
          ...webCursor(disabled ? 'not-allowed' : 'pointer'),
        }
      }}
    >
      {({ pressed }) => {
        const surface = resolveInputSurface(theme, {
          hovered,
          pressed,
          focused: focused || open,
          disabled,
          invalid,
        })

        return (
          <>
            <View style={{ flex: 1 }}>
              <Text
                variant={spec.textVariant}
                numberOfLines={1}
                style={{ color: isPlaceholder ? surface.placeholder : surface.text }}
              >
                {text}
              </Text>
            </View>

            <Chevron color={disabled ? theme.color.textDisabled : theme.color.textMuted} up={open} />

            {/* The shared ring: drawn outside the box, so focusing never reflows the row. */}
            <InputFocusRing visible={focused} radius={theme.radius.lg} />
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
  /** Pointer/keyboard highlight. Distinct from `selected`, which is the stored value. */
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
  const spec = INPUT_SIZE_SPEC[size]

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
        // A row is a full-width target and always clears the minimum touch target on its
        // own, so unlike the trigger it needs no hit slop to compensate for field height.
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
          variant={spec.textVariant}
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
  accessibilityLabel?: string
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
  accessibilityLabel,
  testID,
}: OptionListProps<T>) {
  const theme = useTheme()
  const rowRefs = useRef<Array<View | null>>([])

  // Moving real focus (rather than only a highlight) is what lets the focused Pressable
  // handle Enter/Space itself and lets assistive technology announce the current option.
  // This component mounts only once the panel has been positioned, so the mount run of
  // this effect is also what focuses the initially-active row.
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
      accessibilityRole="menu"
      accessibilityLabel={accessibilityLabel}
      // Popover already caps the panel; the same cap is applied to the scroller so it has
      // a bounded height to scroll inside on both platforms.
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
 * Shared by Select and MultiSelect so the two cannot drift. Enter is handled only when no
 * row holds focus — see note 5 in the file header. Escape is also caught by
 * react-native-web's Modal, which routes it to the same close; running twice is harmless
 * because closing is idempotent.
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
  disabled,
  invalid,
  size = 'md',
  fullWidth = true,
  accessibilityLabel,
  emptyLabel = 'No options',
  style,
  testID,
}: SelectProps<T>) {
  const field = useField()
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [focusedIndex, setFocusedIndex] = useState(-1)

  // An explicit prop always beats the Field, matching Input exactly: the Field is a
  // default, not an authority.
  const isDisabled = disabled ?? field?.disabled ?? false
  const isInvalid = invalid ?? field?.invalid ?? false

  const selectedIndex = options.findIndex((option) => option.value === value)
  const selected = selectedIndex === -1 ? undefined : options[selectedIndex]

  const isOptionDisabled = useCallback(
    (index: number) => options[index]?.disabled === true,
    [options],
  )

  const close = useCallback(() => {
    setOpen(false)
    setFocusedIndex(-1)
  }, [])

  const openList = useCallback(() => {
    if (isDisabled) return
    // Open on the current value when there is one, otherwise on the first choosable
    // option — so the first ArrowDown moves within the list rather than into it.
    setActiveIndex(
      selectedIndex !== -1 && !isOptionDisabled(selectedIndex)
        ? selectedIndex
        : stepActiveIndex(-1, 1, options.length, isOptionDisabled),
    )
    setFocusedIndex(-1)
    setOpen(true)
  }, [isDisabled, isOptionDisabled, options.length, selectedIndex])

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
          isDisabled: isOptionDisabled,
          activeIndex,
          focusedIndex,
          setActiveIndex,
          choose,
          close,
        })
      }
      // A stretched trigger is a form field and its panel must be the field's width; a
      // hugging trigger is a filter chip whose panel should size to its longest option.
      matchAnchorWidth={fullWidth}
      fullWidth={fullWidth}
      anchorStyle={style}
      closeLabel="Close the options list"
      anchor={
        <SelectTrigger
          text={selected ? selected.label : placeholder}
          isPlaceholder={selected === undefined}
          open={open}
          disabled={isDisabled}
          invalid={isInvalid}
          size={size}
          fullWidth={fullWidth}
          onPress={() => (open ? close() : openList())}
          onKey={(key, event) => {
            if (key !== 'ArrowDown' && key !== 'ArrowUp') return
            // Enter and Space are deliberately not handled here: react-native-web already
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
          emptyLabel={emptyLabel}
          onActivate={setActiveIndex}
          onChoose={choose}
          onRowFocusChange={setFocusedIndex}
          accessibilityLabel={accessibilityLabel}
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
 * Multi-value variant, built for filter bars — the Orders status filter is the driving
 * case, which is why it defaults to hugging its content rather than stretching.
 *
 * Two behavioural differences from `Select`, both deliberate:
 *  - Choosing an option toggles it and **keeps the panel open**, because filtering is
 *    nearly always a multi-step action and reopening the list each time is hostile.
 *  - The trigger summarises. A single selection shows its label (more useful than
 *    "1 selected"); beyond that it collapses to "N selected", because a trigger that grows
 *    with the selection reflows the whole toolbar every time a filter is touched.
 */
export function MultiSelect<T extends string>({
  value,
  onChange,
  options,
  placeholder = 'All',
  disabled,
  invalid,
  size = 'md',
  fullWidth = false,
  summaryLabel,
  accessibilityLabel,
  emptyLabel = 'No options',
  style,
  testID,
}: MultiSelectProps<T>) {
  const field = useField()
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [focusedIndex, setFocusedIndex] = useState(-1)

  const isDisabled = disabled ?? field?.disabled ?? false
  const isInvalid = invalid ?? field?.invalid ?? false

  const isOptionDisabled = useCallback(
    (index: number) => options[index]?.disabled === true,
    [options],
  )

  const close = useCallback(() => {
    setOpen(false)
    setFocusedIndex(-1)
  }, [])

  const openList = useCallback(() => {
    if (isDisabled) return
    const firstSelected = options.findIndex((option) => value.includes(option.value))
    setActiveIndex(
      firstSelected !== -1 && !isOptionDisabled(firstSelected)
        ? firstSelected
        : stepActiveIndex(-1, 1, options.length, isOptionDisabled),
    )
    setFocusedIndex(-1)
    setOpen(true)
  }, [isDisabled, isOptionDisabled, options, value])

  const toggle = useCallback(
    (index: number) => {
      const option = options[index]
      if (!option || option.disabled === true) return
      onChange(
        value.includes(option.value)
          ? value.filter((current) => current !== option.value)
          : [...value, option.value],
      )
    },
    [onChange, options, value],
  )

  const triggerText = (): string => {
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
          isDisabled: isOptionDisabled,
          activeIndex,
          focusedIndex,
          setActiveIndex,
          choose: toggle,
          close,
        })
      }
      matchAnchorWidth={fullWidth}
      fullWidth={fullWidth}
      anchorStyle={style}
      closeLabel="Close the options list"
      anchor={
        <SelectTrigger
          text={triggerText()}
          isPlaceholder={value.length === 0}
          open={open}
          disabled={isDisabled}
          invalid={isInvalid}
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
          emptyLabel={emptyLabel}
          onActivate={setActiveIndex}
          onChoose={toggle}
          onRowFocusChange={setFocusedIndex}
          accessibilityLabel={accessibilityLabel}
          testID={testID ? `${testID}-list` : undefined}
        />
      )}
    </Popover>
  )
}
