/**
 * Typographic primitive.
 *
 * Every string rendered in the product goes through this component. React Native's own
 * `Text` has no default size or colour, so using it directly would mean each call site
 * inventing its own — which is exactly how type scales rot. Here the only way to set
 * size is to pick a `variant` from the scale, and the only way to set colour is to pick
 * a semantic `tone`.
 */
import { Text as RNText, StyleSheet, type StyleProp, type TextStyle } from 'react-native'
import type { ReactNode } from 'react'

import { useTheme } from '../theme/ThemeProvider'
import type { TypographyVariant } from '../tokens'

export type TextTone =
  | 'default'
  | 'muted'
  | 'subtle'
  | 'disabled'
  | 'inverse'
  | 'primary'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'

export type TextProps = {
  children: ReactNode
  variant?: TypographyVariant
  tone?: TextTone
  /** Overrides the variant's weight when a single instance needs emphasis. */
  weight?: '400' | '500' | '600' | '700'
  align?: 'left' | 'center' | 'right'
  /**
   * Fixed-width digits. Essential for money and counts in tables — proportional numerals
   * make column figures visibly ragged and hard to compare down a column.
   */
  numeric?: boolean
  /** Truncate to N lines with an ellipsis. */
  numberOfLines?: number
  style?: StyleProp<TextStyle>
  testID?: string
}

export function Text({
  children,
  variant = 'body',
  tone = 'default',
  weight,
  align,
  numeric = false,
  numberOfLines,
  style,
  testID,
}: TextProps) {
  const theme = useTheme()
  const scale = theme.typography[variant]

  const toneColor: Record<TextTone, string> = {
    default: theme.color.text,
    muted: theme.color.textMuted,
    subtle: theme.color.textSubtle,
    disabled: theme.color.textDisabled,
    inverse: theme.color.textInverse,
    primary: theme.color.primaryText,
    success: theme.color.successText,
    warning: theme.color.warningText,
    danger: theme.color.dangerText,
    info: theme.color.infoText,
  }

  return (
    <RNText
      testID={testID}
      numberOfLines={numberOfLines}
      style={[
        {
          fontFamily: theme.fontFamily.sans,
          fontSize: scale.fontSize,
          lineHeight: scale.lineHeight,
          letterSpacing: scale.letterSpacing,
          fontWeight: (weight ?? scale.fontWeight) as TextStyle['fontWeight'],
          color: toneColor[tone],
          ...(align ? { textAlign: align } : {}),
          // `fontVariant` is honoured by react-native-web and by native iOS/Android.
          ...(numeric ? { fontVariant: ['tabular-nums' as const] } : {}),
        },
        style,
      ]}
    >
      {children}
    </RNText>
  )
}

/** Monospaced identifiers — order numbers, ids. Aligns and scans better in tables. */
export function MonoText({ children, style, ...rest }: TextProps) {
  const theme = useTheme()
  return (
    <Text {...rest} style={[{ fontFamily: theme.fontFamily.mono }, style]}>
      {children}
    </Text>
  )
}

export const textStyles = StyleSheet.create({})
