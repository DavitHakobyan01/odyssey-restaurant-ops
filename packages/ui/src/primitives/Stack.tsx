/**
 * Layout primitives.
 *
 * `Stack` (and its `HStack` / `VStack` aliases) exists so that spacing between elements
 * is always a token, never an ad-hoc margin. Margins on children are the usual way
 * layouts become inconsistent — every call site picks its own number and they slowly
 * diverge. A `gap` prop constrained to the spacing scale makes that impossible.
 */
import { View, type StyleProp, type ViewStyle } from 'react-native'
import type { ReactNode } from 'react'

import { useTheme } from '../theme/ThemeProvider'
import { spacing as spacingTokens, type Spacing } from '../tokens'

export type StackProps = {
  children?: ReactNode
  direction?: 'row' | 'column'
  gap?: Spacing
  align?: ViewStyle['alignItems']
  justify?: ViewStyle['justifyContent']
  /** Allow children to wrap onto multiple lines — used by filter bars and tag lists. */
  wrap?: boolean
  flex?: number
  padding?: Spacing
  paddingX?: Spacing
  paddingY?: Spacing
  style?: StyleProp<ViewStyle>
  testID?: string
}

export function Stack({
  children,
  direction = 'column',
  gap = 0,
  align,
  justify,
  wrap = false,
  flex,
  padding,
  paddingX,
  paddingY,
  style,
  testID,
}: StackProps) {
  return (
    <View
      testID={testID}
      style={[
        {
          flexDirection: direction,
          gap: spacingTokens[gap],
          ...(align ? { alignItems: align } : {}),
          ...(justify ? { justifyContent: justify } : {}),
          ...(wrap ? { flexWrap: 'wrap' as const } : {}),
          ...(flex !== undefined ? { flex } : {}),
          ...(padding !== undefined ? { padding: spacingTokens[padding] } : {}),
          ...(paddingX !== undefined ? { paddingHorizontal: spacingTokens[paddingX] } : {}),
          ...(paddingY !== undefined ? { paddingVertical: spacingTokens[paddingY] } : {}),
        },
        style,
      ]}
    >
      {children}
    </View>
  )
}

export function HStack(props: Omit<StackProps, 'direction'>) {
  return <Stack {...props} direction="row" />
}

export function VStack(props: Omit<StackProps, 'direction'>) {
  return <Stack {...props} direction="column" />
}

/** Pushes siblings apart inside a flex container. */
export function Spacer() {
  return <View style={{ flex: 1 }} />
}

/** A one-pixel rule using the theme's border colour. */
export function Divider({
  direction = 'horizontal',
  style,
}: {
  direction?: 'horizontal' | 'vertical'
  style?: StyleProp<ViewStyle>
}) {
  const theme = useTheme()
  return (
    <View
      style={[
        { backgroundColor: theme.color.border },
        direction === 'horizontal'
          ? { height: 1, alignSelf: 'stretch' }
          : { width: 1, alignSelf: 'stretch' },
        style,
      ]}
    />
  )
}
