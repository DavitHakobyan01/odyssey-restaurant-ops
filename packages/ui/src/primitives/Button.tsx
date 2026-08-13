/**
 * Button — the reference primitive for this design system.
 *
 * Every other interactive component follows the pattern established here:
 *
 *  1. **Variants are semantic, not visual.** Callers pick `danger`, never `red`. The
 *     mapping from meaning to colour is the theme's job, which is what lets dark mode
 *     and any future rebrand happen in one file.
 *
 *  2. **All five interaction states are explicit** — rest, hover, active/pressed, focus
 *     and disabled. React Native's `Pressable` reports pressed and hovered; focus is
 *     tracked separately so keyboard users get a visible ring on web. Hover states that
 *     only exist on web degrade harmlessly on native, where they never fire.
 *
 *  3. **The focus ring never shifts layout.** It is drawn as an absolutely-positioned
 *     outline outside the button's box rather than as a border, so focusing an element
 *     cannot reflow the page around it.
 *
 *  4. **Loading is not the same as disabled.** A loading button keeps its width (the
 *     label stays mounted but transparent) so a row of buttons does not jump when one is
 *     submitting, and it blocks presses without looking inert.
 */
import { useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import type { ReactNode } from 'react'

import { webCursor } from '../theme/platform'
import { useTheme } from '../theme/ThemeProvider'
import type { Theme } from '../tokens'
import { Text } from './Text'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dangerSubtle'
export type ButtonSize = 'sm' | 'md' | 'lg'

export type ButtonProps = {
  children?: ReactNode
  onPress?: () => void
  variant?: ButtonVariant
  size?: ButtonSize
  disabled?: boolean
  loading?: boolean
  /** Stretch to fill the parent — used in modal footers and mobile layouts. */
  fullWidth?: boolean
  iconLeft?: ReactNode
  iconRight?: ReactNode
  /** Accessible name. Required when the button renders only an icon. */
  accessibilityLabel?: string
  style?: StyleProp<ViewStyle>
  testID?: string
}

type VisualState = {
  background: string
  border: string
  text: string
}

/**
 * Resolve the colour triple for a variant in a given interaction state.
 *
 * Written as one function rather than a StyleSheet per variant because the state matrix
 * (5 variants x 4 states) is where inconsistency creeps in — keeping it in a single
 * readable switch makes a missing hover colour obvious.
 */
function resolveVisual(
  theme: Theme,
  variant: ButtonVariant,
  state: { hovered: boolean; pressed: boolean; disabled: boolean },
): VisualState {
  if (state.disabled) {
    return {
      background:
        variant === 'ghost' || variant === 'secondary' ? 'transparent' : theme.color.surfaceDisabled,
      border: variant === 'ghost' ? 'transparent' : theme.color.border,
      text: theme.color.textDisabled,
    }
  }

  switch (variant) {
    case 'primary':
      return {
        background: state.pressed
          ? theme.color.primaryActive
          : state.hovered
            ? theme.color.primaryHover
            : theme.color.primary,
        border: 'transparent',
        text: theme.color.textInverse,
      }

    case 'danger':
      return {
        background: state.pressed
          ? theme.color.dangerHover
          : state.hovered
            ? theme.color.dangerHover
            : theme.color.danger,
        border: 'transparent',
        text: theme.color.textInverse,
      }

    case 'dangerSubtle':
      return {
        background: state.pressed || state.hovered ? theme.color.dangerSubtle : 'transparent',
        border: theme.color.dangerBorder,
        text: theme.color.dangerText,
      }

    case 'ghost':
      return {
        background: state.pressed
          ? theme.color.surfaceActive
          : state.hovered
            ? theme.color.surfaceHover
            : 'transparent',
        border: 'transparent',
        text: theme.color.text,
      }

    case 'secondary':
    default:
      return {
        background: state.pressed
          ? theme.color.surfaceActive
          : state.hovered
            ? theme.color.surfaceHover
            : theme.color.surface,
        border: theme.color.borderStrong,
        text: theme.color.text,
      }
  }
}

const SIZE_SPEC = {
  sm: { height: 32, paddingH: 3, gap: 1.5, variant: 'bodySm' },
  md: { height: 38, paddingH: 4, gap: 2, variant: 'bodySm' },
  lg: { height: 46, paddingH: 5, gap: 2, variant: 'body' },
} as const

export function Button({
  children,
  onPress,
  variant = 'secondary',
  size = 'md',
  disabled = false,
  loading = false,
  fullWidth = false,
  iconLeft,
  iconRight,
  accessibilityLabel,
  style,
  testID,
}: ButtonProps) {
  const theme = useTheme()
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)

  // A loading button must not fire again, but is styled as active rather than disabled.
  const interactionBlocked = disabled || loading

  const spec = SIZE_SPEC[size]

  return (
    <View style={[fullWidth ? { alignSelf: 'stretch' } : { alignSelf: 'flex-start' }, style]}>
      <Pressable
        testID={testID}
        onPress={interactionBlocked ? undefined : onPress}
        disabled={interactionBlocked}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ disabled: interactionBlocked, busy: loading }}
        style={({ pressed }) => {
          const visual = resolveVisual(theme, variant, {
            hovered,
            pressed,
            disabled,
          })

          return {
            height: spec.height,
            minWidth: spec.height,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: theme.spacing[spec.gap],
            paddingHorizontal: theme.spacing[spec.paddingH],
            borderRadius: theme.radius.lg,
            borderWidth: theme.borderWidth.hairline,
            backgroundColor: visual.background,
            borderColor: visual.border,
            // Communicates non-interactivity without hiding the label entirely.
            opacity: disabled ? 0.7 : 1,
            ...webCursor(interactionBlocked ? 'not-allowed' : 'pointer'),
          }
        }}
      >
        {({ pressed }) => {
          const visual = resolveVisual(theme, variant, { hovered, pressed, disabled })

          return (
            <>
              {/*
                Label and icons stay mounted while loading and are simply made
                transparent, so the button keeps its exact width and a toolbar does not
                reflow when one button starts working.
              */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: theme.spacing[spec.gap],
                  opacity: loading ? 0 : 1,
                }}
              >
                {iconLeft}
                {children !== undefined && children !== null ? (
                  <Text variant={spec.variant} weight="500" style={{ color: visual.text }}>
                    {children}
                  </Text>
                ) : null}
                {iconRight}
              </View>

              {loading ? (
                <View style={{ position: 'absolute', alignItems: 'center', justifyContent: 'center' }}>
                  <ActivityIndicator size="small" color={visual.text} />
                </View>
              ) : null}

              {/*
                Focus ring drawn outside the box. Using a border here instead would change
                the element's size on focus and shift everything next to it.
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
    </View>
  )
}

/** Square icon-only button. Enforces an accessible name, since there is no visible label. */
export function IconButton({
  icon,
  accessibilityLabel,
  ...rest
}: Omit<ButtonProps, 'children' | 'iconLeft' | 'iconRight'> & {
  icon: ReactNode
  accessibilityLabel: string
}) {
  return (
    <Button {...rest} accessibilityLabel={accessibilityLabel} iconLeft={icon} />
  )
}
