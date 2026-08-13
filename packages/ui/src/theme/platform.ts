/**
 * Platform-specific style escape hatches.
 *
 * react-native-web understands a handful of CSS properties that React Native's own style
 * types do not declare — `cursor` being the one this design system actually needs, so
 * that pointer feedback on the web build is correct.
 *
 * Rather than scatter `as ViewStyle` casts through every interactive component (which
 * would also silence genuine style type errors at those call sites), the cast is
 * quarantined here in one documented place, and it is guarded by a platform check so the
 * property is never emitted on native.
 */
import { Platform, type ViewStyle } from 'react-native'

export type WebCursor = 'pointer' | 'not-allowed' | 'default' | 'text' | 'grab'

/**
 * Spread into a style object: `{ ...webCursor('pointer') }`.
 *
 * Returns an empty object on native, so the property simply does not exist there.
 */
export function webCursor(cursor: WebCursor): ViewStyle {
  return Platform.OS === 'web' ? ({ cursor } as ViewStyle) : {}
}

/** True on the web build. Prefer `useBreakpoint()` for layout; this is for capability checks. */
export const isWeb = Platform.OS === 'web'
