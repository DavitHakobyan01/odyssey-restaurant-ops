/**
 * Alert — an inline banner tied to the content it sits next to.
 *
 * The division of labour with `Toast` matters and is easy to get wrong:
 *
 *  - **Alert is persistent and in-flow.** It stays until the underlying condition is
 *    resolved and it pushes layout, so the operator cannot miss it and cannot lose it by
 *    looking away. Use it for state that is still true: a station offline, a form that
 *    failed validation, a warning about the shift about to end.
 *  - **Toast is transient and floating.** Use it to confirm an action that already
 *    completed.
 *
 * Colours come from `toneColors()` — the same triple used by Badge and Toast — so a
 * `danger` alert and a `danger` badge cannot drift apart. Because that helper resolves
 * against the active theme, this component has no dark-mode branch at all.
 */
import { useState } from 'react'
import {
  Pressable,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import type { ReactNode } from 'react'

import { useTheme } from '../theme/ThemeProvider'
import { toneColors, type Tone } from '../tokens'
import { Text } from './Text'

export type AlertProps = {
  tone?: Tone
  title: string
  description?: string
  /**
   * Trailing action, rendered under the text. A `ReactNode` rather than a
   * `{ label, onPress }` pair so callers can drop in a `Button` of any variant without
   * this component growing a parallel button API.
   */
  action?: ReactNode
  /** Providing this renders the close control. Omit it for conditions the operator cannot dismiss. */
  onDismiss?: () => void
  /** Leading icon. The system ships no icon set, so the node is supplied by the caller. */
  icon?: ReactNode
  style?: StyleProp<ViewStyle>
  testID?: string
}

export function Alert({
  tone = 'info',
  title,
  description,
  action,
  onDismiss,
  icon,
  style,
  testID,
}: AlertProps) {
  const theme = useTheme()
  const colors = toneColors(theme, tone)

  // `danger` interrupts; everything else waits for the screen reader to finish its
  // current utterance. Interrupting for a success banner is the reason people turn
  // screen-reader announcements off.
  const assertive = tone === 'danger'

  return (
    <View
      testID={testID}
      accessibilityRole="alert"
      accessibilityLiveRegion={assertive ? 'assertive' : 'polite'}
      style={[
        {
          alignSelf: 'stretch',
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: theme.spacing[3],
          padding: theme.spacing[3],
          borderRadius: theme.radius.lg,
          borderWidth: theme.borderWidth.hairline,
          borderColor: colors.border,
          backgroundColor: colors.background,
        },
        style,
      ]}
    >
      {icon ? (
        // Nudged down by the difference between the icon box and the title's cap height,
        // so the icon optically aligns with the first line rather than its box aligning
        // with the text box.
        <View style={{ paddingTop: theme.spacing[0.5] }}>{icon}</View>
      ) : null}

      <View style={{ flex: 1, gap: theme.spacing[1] }}>
        <Text variant="bodyMedium" style={{ color: colors.text }}>
          {title}
        </Text>

        {description ? (
          // Muted rather than a lighter step of the tone: the tinted background already
          // carries the meaning, and a second hue of the same colour reads as a bug.
          <Text variant="bodySm" tone="muted">
            {description}
          </Text>
        ) : null}

        {action ? <View style={{ paddingTop: theme.spacing[1] }}>{action}</View> : null}
      </View>

      {onDismiss ? <AlertDismissButton onPress={onDismiss} tone={tone} /> : null}
    </View>
  )
}

/* -------------------------------------------------------------------------- */
/*                                Dismiss control                              */
/* -------------------------------------------------------------------------- */

/**
 * The close control, with the full five-state treatment from `Button`.
 *
 * Two things are deliberate:
 *
 *  - It escalates through the *tone's own* colours (transparent -> tone border ->
 *    tone solid) rather than the neutral `surfaceHover`. A grey hover square on a red
 *    banner looks like a rendering mistake.
 *  - The visual box is 28px but `hitSlop` extends the touch area to the 44px minimum, so
 *    the banner stays compact without becoming a mis-tap generator on a phone.
 */
function AlertDismissButton({ onPress, tone }: { onPress: () => void; tone: Tone }) {
  const theme = useTheme()
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const colors = toneColors(theme, tone)

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
      accessibilityLabel="Dismiss"
      style={({ pressed }) => ({
        width: box,
        height: box,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: theme.radius.md,
        backgroundColor: pressed ? colors.solid : hovered ? colors.border : 'transparent',
        cursor: 'pointer',
      })}
    >
      {({ pressed }) => (
        <>
          <Text
            variant="body"
            weight="500"
            style={{ color: pressed ? theme.color.textInverse : colors.text }}
          >
            {'×'}
          </Text>

          {/* Ring is drawn outside the box so focusing it cannot reflow the banner. */}
          {focused ? (
            <View
              style={{
                pointerEvents: 'none',
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
