/**
 * Avatar — initials on a colour derived from the name.
 *
 * Used everywhere a person appears: CRM guest lists, order assignees, shift rosters. It
 * renders initials only — no image loading, no placeholder-image fallback, no dependency.
 * A photo-capable avatar can wrap this later; every screen that needs one today has names
 * and no photos.
 *
 * **Why the colour is hashed into the tone vocabulary rather than the raw palette.**
 * The obvious implementation picks a step out of `palette.ts` by hash. Components must not
 * import the palette — that file is raw hex with no light/dark mapping, so a hard-coded
 * `blue[100]` background would be a bright chip on a dark dashboard, and its text colour
 * would have to be guessed. Hashing into `TONES` and resolving through `toneColors()`
 * instead gives the same deterministic, well-distributed colour assignment while inheriting
 * the theme's guarantee that the `background`/`text` pair clears AA in *both* modes.
 *
 * `danger` is excluded from the pool on purpose: in an ops tool a red-ringed avatar reads
 * as "this person is a problem", and no one should be assigned that by their surname.
 *
 * The hash is intentionally trivial (a djb2/31-multiplier walk over code points). It is a
 * colour picker, not a security primitive; what matters is that it is stable across
 * sessions, platforms and renders, so a given guest keeps the same colour forever.
 */
import { View, type StyleProp, type ViewStyle } from 'react-native'

import { useTheme } from '../theme/ThemeProvider'
import { toneColors, type Spacing, type Tone, type TypographyVariant } from '../tokens'
import { Text } from './Text'

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

export type AvatarProps = {
  /** Full name. Drives both the initials and the colour. */
  name: string
  size?: AvatarSize
  /** Pin the colour instead of hashing it — for "unassigned" slots and the like. */
  tone?: Tone
  /** Squircle instead of a circle. Used where avatars sit in a grid of square tiles. */
  shape?: 'circle' | 'rounded'
  /**
   * Overrides the announced name. The default is the `name` prop, because initials alone
   * ("DH") are read out as nonsense.
   */
  accessibilityLabel?: string
  style?: StyleProp<ViewStyle>
  testID?: string
}

/**
 * Diameters as spacing-scale keys (20 / 24 / 32 / 40 / 56px) paired with the type variant
 * whose line height fits inside them.
 */
const SIZE_SPEC = {
  xs: { diameter: 5, variant: 'caption' },
  sm: { diameter: 6, variant: 'caption' },
  md: { diameter: 8, variant: 'bodySm' },
  lg: { diameter: 10, variant: 'bodyMedium' },
  xl: { diameter: 14, variant: 'titleSm' },
} as const satisfies Record<AvatarSize, { diameter: Spacing; variant: TypographyVariant }>

/** The colour pool. See the file header for why `danger` is not in it. */
const AVATAR_TONES: readonly Tone[] = ['primary', 'info', 'success', 'warning', 'neutral']

/**
 * First *code point* rather than `s[0]`.
 *
 * `s[0]` returns half a surrogate pair, so a name starting with an emoji or an astral-plane
 * character would render a replacement glyph.
 */
function firstCodePoint(word: string): string {
  return Array.from(word)[0] ?? ''
}

/**
 * "Amélie Fontaine" -> "AF", "cher" -> "C", "  " -> "?".
 *
 * First and last word rather than the first two, because "Maria del Carmen Rodríguez"
 * should be MR, not MD.
 */
export function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter((part) => part.length > 0)
  const first = parts[0]
  if (first === undefined) return '?'

  const last = parts.length > 1 ? parts[parts.length - 1] : undefined
  const initials = firstCodePoint(first) + (last !== undefined ? firstCodePoint(last) : '')
  return initials.toUpperCase()
}

/**
 * Stable non-negative hash of a name.
 *
 * Lower-cased and trimmed first so the same person keeps one colour whether they arrive as
 * "DAVID H" from an import or "David H" from the booking form.
 */
export function toneForName(name: string): Tone {
  const normalised = name.trim().toLowerCase()
  let hash = 0
  for (const char of normalised) {
    // `| 0` keeps this in int32 range, which is what makes the result identical on every
    // JS engine rather than drifting once the float loses precision.
    hash = (hash * 31 + (char.codePointAt(0) ?? 0)) | 0
  }

  const index = Math.abs(hash) % AVATAR_TONES.length
  return AVATAR_TONES[index] ?? 'neutral'
}

export function Avatar({
  name,
  size = 'md',
  tone,
  shape = 'circle',
  accessibilityLabel,
  style,
  testID,
}: AvatarProps) {
  const theme = useTheme()
  const spec = SIZE_SPEC[size]
  const diameter = theme.spacing[spec.diameter]
  const tc = toneColors(theme, tone ?? toneForName(name))

  return (
    <View
      testID={testID}
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel ?? name}
      style={[
        {
          width: diameter,
          height: diameter,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: shape === 'circle' ? theme.radius.full : theme.radius.md,
          backgroundColor: tc.background,
          // The subtle tone backgrounds sit close to `surface`; the hairline keeps the
          // avatar from dissolving into a white card or a dark row.
          borderWidth: theme.borderWidth.hairline,
          borderColor: tc.border,
        },
        style,
      ]}
    >
      <Text variant={spec.variant} weight="600" numberOfLines={1} style={{ color: tc.text }}>
        {initialsFromName(name)}
      </Text>
    </View>
  )
}
