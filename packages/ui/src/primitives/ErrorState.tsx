/**
 * ErrorState — a region that failed, plus the way out of it.
 *
 * The shape mirrors `EmptyState` so the two are interchangeable at the same call site
 * (`if (error) <ErrorState/> else if (!data.length) <EmptyState/>`), but the intent is
 * different in three ways that are deliberate:
 *
 *  1. **There is always a way forward.** `onRetry` renders a real `Button`. A dead end
 *     with no action forces the operator to reload the whole app mid-shift, which loses
 *     every other panel's state.
 *
 *  2. **The raw error message is shown, but demoted.** Hiding it entirely means support
 *     conversations turn into guesswork; showing it as body copy makes the screen feel
 *     broken rather than recoverable. It goes in a sunken monospaced well, which reads as
 *     "diagnostic detail" — present for whoever needs it, ignorable by everyone else.
 *
 *  3. **The tone accent is restrained.** Only the icon well is tinted `danger`; the copy
 *     stays in normal text colours. A wall of red says "you broke something", when the
 *     usual cause is a network blip.
 */
import { View, type StyleProp, type ViewStyle } from 'react-native'
import type { ReactNode } from 'react'

import { useTheme } from '../theme/ThemeProvider'
import type { Spacing, TypographyVariant } from '../tokens'
import { Button } from './Button'
import { MonoText, Text } from './Text'

export type ErrorStateSize = 'sm' | 'md'

export type ErrorStateProps = {
  /** Human-readable summary. Defaults to the neutral, non-accusatory phrasing. */
  title?: string
  /** What the operator can do about it, in plain language. */
  description?: string
  /**
   * The caught value. Typed `unknown` because that is what a `catch` binding and a failed
   * query actually give you — forcing callers to cast to `Error` first is how `undefined`
   * ends up rendered on screen.
   */
  error?: unknown
  onRetry?: () => void
  retryLabel?: string
  /** Overrides the default tinted well. */
  icon?: ReactNode
  size?: ErrorStateSize
  style?: StyleProp<ViewStyle>
  testID?: string
}

/**
 * Pull a displayable message out of an unknown thrown value.
 *
 * The `'message' in error` branch is not redundant with the `instanceof` check: errors
 * that cross a realm boundary (a worker, a fetch polyfill, a serialised API envelope)
 * fail `instanceof Error` while still carrying a perfectly good message.
 */
function extractMessage(error: unknown): string | undefined {
  if (error === null || error === undefined) return undefined
  if (typeof error === 'string') return error.trim() || undefined
  if (error instanceof Error) return error.message || undefined
  if (typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message
    return typeof message === 'string' && message.trim() ? message : undefined
  }
  return undefined
}

const SIZE_SPEC: Record<
  ErrorStateSize,
  {
    paddingY: Spacing
    paddingX: Spacing
    well: Spacing
    gap: Spacing
    title: TypographyVariant
    description: TypographyVariant
  }
> = {
  sm: { paddingY: 8, paddingX: 4, well: 10, gap: 2, title: 'heading', description: 'bodySm' },
  md: { paddingY: 16, paddingX: 6, well: 12, gap: 3, title: 'titleSm', description: 'body' },
}

export function ErrorState({
  title = 'Something went wrong',
  description,
  error,
  onRetry,
  retryLabel = 'Try again',
  icon,
  size = 'md',
  style,
  testID,
}: ErrorStateProps) {
  const theme = useTheme()
  const spec = SIZE_SPEC[size]
  const wellSize = theme.spacing[spec.well]
  const message = extractMessage(error)

  return (
    <View
      testID={testID}
      accessibilityRole="alert"
      // Polite, not assertive: these regions re-render on every failed refetch, and
      // interrupting the operator mid-sentence each time trains them to disable
      // announcements altogether.
      accessibilityLiveRegion="polite"
      style={[
        {
          alignSelf: 'stretch',
          alignItems: 'center',
          justifyContent: 'center',
          gap: theme.spacing[spec.gap],
          paddingVertical: theme.spacing[spec.paddingY],
          paddingHorizontal: theme.spacing[spec.paddingX],
        },
        style,
      ]}
    >
      <View
        style={{
          width: wellSize,
          height: wellSize,
          borderRadius: theme.radius.full,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.color.dangerSubtle,
          marginBottom: theme.spacing[1],
        }}
      >
        {/* Falls back to a typographic mark so the component is usable with no icon set,
            and so callers are never forced to pass a node just to avoid a hole. */}
        {icon ?? (
          <Text variant="titleSm" tone="danger">
            {'!'}
          </Text>
        )}
      </View>

      <Text variant={spec.title} align="center">
        {title}
      </Text>

      {description ? (
        <Text variant={spec.description} tone="muted" align="center">
          {description}
        </Text>
      ) : null}

      {message ? (
        <View
          style={{
            alignSelf: 'stretch',
            paddingVertical: theme.spacing[2],
            paddingHorizontal: theme.spacing[3],
            borderRadius: theme.radius.md,
            borderWidth: theme.borderWidth.hairline,
            borderColor: theme.color.borderSubtle,
            backgroundColor: theme.color.surfaceSunken,
          }}
        >
          {/* Clamped: a stack trace or a 400-character server message would otherwise
              push the retry button off the screen, which removes the only way out. */}
          <MonoText variant="bodySm" tone="subtle" align="center" numberOfLines={3}>
            {message}
          </MonoText>
        </View>
      ) : null}

      {onRetry ? (
        <View style={{ paddingTop: theme.spacing[2] }}>
          <Button variant="secondary" size={size === 'sm' ? 'sm' : 'md'} onPress={onRetry}>
            {retryLabel}
          </Button>
        </View>
      ) : null}
    </View>
  )
}
