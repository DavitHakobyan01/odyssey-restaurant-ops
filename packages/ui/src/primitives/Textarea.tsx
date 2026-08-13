/**
 * Textarea — multi-line text, in the same box as Input.
 *
 * It imports `resolveInputSurface`, `INPUT_SIZE_SPEC` and `InputFocusRing` from Input
 * rather than restating them. A textarea that is one hue off the text field above it is
 * the classic sign of a design system that was copied instead of shared, and the only way
 * to prevent it is to make the chrome physically the same code.
 *
 * Growth model, and its honest limitation:
 *
 *  - The box starts at `numberOfLines` rows, grows with the content, and stops at
 *    `maxNumberOfLines` rows — after which the text scrolls inside it. Growing without a
 *    ceiling would push the form's submit button off screen while someone writes a long
 *    kitchen note; never growing would make them edit through a two-line porthole.
 *
 *  - Height comes from `onContentSizeChange`, which on react-native-web is backed by the
 *    DOM's `scrollHeight`. `scrollHeight` can never report *less* than the height we have
 *    already applied, so on web the box grows freely but does not shrink back when text
 *    is deleted. We reset the measurement when the value becomes empty, which covers the
 *    case operators actually hit (clear the field and start again) and avoids fighting
 *    the DOM from inside a React Native component. Native has no such limitation.
 */
import { useRef, useState, type ComponentRef, type ReactNode } from 'react'
import {
  Pressable,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native'

import { useTheme } from '../theme/ThemeProvider'
import { useField } from './Field'
import { InputFocusRing, resolveInputSurface } from './Input'

export type TextareaProps = {
  value?: string
  onChangeText?: (text: string) => void
  placeholder?: string
  /** Falls back to the surrounding Field's disabled state. */
  disabled?: boolean
  /** Falls back to the surrounding Field showing an error. */
  invalid?: boolean
  /** Rows shown at rest, and the height the box never drops below. */
  numberOfLines?: number
  /** Rows after which the content scrolls instead of the box growing. */
  maxNumberOfLines?: number
  autoFocus?: boolean
  onFocus?: () => void
  onBlur?: () => void
  maxLength?: number
  /** Adornment pinned to the top-right of the box — a character counter, usually. */
  rightSlot?: ReactNode
  accessibilityLabel?: string
  style?: StyleProp<ViewStyle>
  testID?: string
}

export function Textarea({
  value,
  onChangeText,
  placeholder,
  disabled,
  invalid,
  numberOfLines = 3,
  maxNumberOfLines = 8,
  autoFocus = false,
  onFocus,
  onBlur,
  maxLength,
  rightSlot,
  accessibilityLabel,
  style,
  testID,
}: TextareaProps) {
  const theme = useTheme()
  const field = useField()
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [contentHeight, setContentHeight] = useState(0)
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null)

  const isDisabled = disabled ?? field?.disabled ?? false
  const isInvalid = invalid ?? field?.invalid ?? false

  const scale = theme.typography.body
  const paddingV = theme.spacing[2.5]
  const chrome = paddingV * 2 + theme.borderWidth.hairline * 2

  // Rows are converted to pixels through the type scale's absolute line height, so a
  // three-row textarea is exactly three lines of the body style — not an approximation
  // that drifts the moment the type scale is retuned.
  const rows = Math.max(1, numberOfLines)
  const maxRows = Math.max(rows, maxNumberOfLines)
  const minHeight = rows * scale.lineHeight + chrome
  const maxHeight = maxRows * scale.lineHeight + chrome

  const measuredHeight = contentHeight > 0 ? contentHeight + chrome : minHeight
  const boxHeight = Math.min(Math.max(measuredHeight, minHeight), maxHeight)
  const atCeiling = measuredHeight >= maxHeight

  return (
    <View style={[{ alignSelf: 'stretch' }, style]}>
      <Pressable
        // Same rationale as Input: a click on the padding should land in the text, and
        // this wrapper must not become a tab stop of its own.
        accessible={false}
        focusable={false}
        disabled={isDisabled}
        onPress={() => inputRef.current?.focus()}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        style={({ pressed }) => {
          const surface = resolveInputSurface(theme, {
            hovered,
            pressed,
            focused,
            disabled: isDisabled,
            invalid: isInvalid,
          })

          return {
            height: boxHeight,
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: theme.spacing[2],
            paddingHorizontal: theme.spacing[3],
            paddingVertical: paddingV,
            borderRadius: theme.radius.lg,
            borderWidth: theme.borderWidth.hairline,
            borderColor: surface.border,
            backgroundColor: surface.background,
          }
        }}
      >
        {({ pressed }) => {
          const surface = resolveInputSurface(theme, {
            hovered,
            pressed,
            focused,
            disabled: isDisabled,
            invalid: isInvalid,
          })

          return (
            <>
              <TextInput
                ref={inputRef}
                testID={testID}
                nativeID={field?.controlId}
                accessibilityLabelledBy={field?.labelId}
                accessibilityLabel={accessibilityLabel}
                accessibilityHint={field?.description}
                accessibilityState={{ disabled: isDisabled }}
                multiline
                numberOfLines={rows}
                // Only scrollable once it has stopped growing; scrolling a box that is
                // still able to expand hides text for no reason.
                scrollEnabled={atCeiling}
                value={value}
                onChangeText={(text) => {
                  // See the header note: on web the measurement is a floor, so clearing
                  // the field is the moment we let the box collapse again.
                  if (text.length === 0) setContentHeight(0)
                  onChangeText?.(text)
                }}
                onContentSizeChange={(event) => {
                  setContentHeight(event.nativeEvent.contentSize.height)
                }}
                placeholder={placeholder}
                placeholderTextColor={surface.placeholder}
                editable={!isDisabled}
                autoFocus={autoFocus}
                maxLength={maxLength}
                onFocus={() => {
                  setFocused(true)
                  onFocus?.()
                }}
                onBlur={() => {
                  setFocused(false)
                  onBlur?.()
                }}
                style={{
                  flex: 1,
                  height: '100%',
                  paddingVertical: 0,
                  // Android otherwise centres the first line in the box; the caret
                  // belongs at the top of a multi-line field.
                  textAlignVertical: 'top',
                  color: surface.text,
                  fontFamily: theme.fontFamily.sans,
                  fontSize: scale.fontSize,
                  lineHeight: scale.lineHeight,
                  letterSpacing: scale.letterSpacing,
                  // See Input: we draw our own layout-stable ring, so the platform's
                  // outline must go. RN's type has no 'none'; zero width says the same.
                  outlineStyle: 'solid',
                  outlineWidth: 0,
                }}
              />

              {rightSlot}

              <InputFocusRing visible={focused} radius={theme.radius.lg} />
            </>
          )
        }}
      </Pressable>
    </View>
  )
}
