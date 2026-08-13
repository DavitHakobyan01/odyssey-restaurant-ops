/**
 * Design tokens — the single source of visual truth.
 *
 * Every value a component can style with lives here. Components never contain literal
 * hex codes, pixel values, font sizes or shadow definitions; they reference tokens. That
 * constraint is what makes the system actually reusable rather than merely organised —
 * a change to `spacing[4]` or `color.borderSubtle` propagates everywhere at once, and
 * nothing drifts because nothing had its own copy.
 *
 * Structure:
 *   palette.ts   raw ramps (hex values, no meaning attached)
 *   this file    semantic tokens, scales, and the light/dark theme mappings
 *
 * Everything is expressed in React Native primitives (numbers for spacing, no `px`
 * strings), so the same tokens drive web and native without translation.
 */
import { palette } from './palette'

export { palette } from './palette'
export type { Palette } from './palette'

/* -------------------------------------------------------------------------- */
/*                                   Spacing                                   */
/* -------------------------------------------------------------------------- */

/**
 * A 4px base scale. Every margin, padding and gap in the product is one of these.
 *
 * Keys are multipliers of the 4px base, so `spacing[4]` is 16px. Naming them by
 * multiplier rather than t-shirt size ("md", "lg") keeps the rhythm explicit at the call
 * site and avoids the endless argument about what comes after "xl".
 */
export const spacing = {
  0: 0,
  px: 1,
  0.5: 2,
  1: 4,
  1.5: 6,
  2: 8,
  2.5: 10,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  7: 28,
  8: 32,
  10: 40,
  12: 48,
  14: 56,
  16: 64,
  20: 80,
  24: 96,
} as const

export type Spacing = keyof typeof spacing

/* -------------------------------------------------------------------------- */
/*                                 Typography                                  */
/* -------------------------------------------------------------------------- */

/**
 * Type scale.
 *
 * `lineHeight` is an absolute number, not a multiplier — React Native requires absolute
 * line heights, and fixing them here guarantees vertical rhythm is identical on web and
 * native rather than depending on each platform's default leading.
 *
 * `letterSpacing` tightens as size increases, which is what stops large headings looking
 * loose and small labels looking cramped.
 */
export const typography = {
  /** Numeric labels, table captions, badge text. */
  caption: { fontSize: 11, lineHeight: 16, letterSpacing: 0.3, fontWeight: '500' },
  /** Secondary body text, helper text, table cells. */
  bodySm: { fontSize: 13, lineHeight: 18, letterSpacing: 0, fontWeight: '400' },
  /** Default body text. */
  body: { fontSize: 15, lineHeight: 22, letterSpacing: 0, fontWeight: '400' },
  /** Emphasised body — form labels, list item titles. */
  bodyMedium: { fontSize: 15, lineHeight: 22, letterSpacing: 0, fontWeight: '500' },
  /** Card titles, section headers. */
  heading: { fontSize: 17, lineHeight: 24, letterSpacing: -0.2, fontWeight: '600' },
  /** Page section titles. */
  titleSm: { fontSize: 20, lineHeight: 28, letterSpacing: -0.3, fontWeight: '600' },
  /** Page titles. */
  title: { fontSize: 26, lineHeight: 34, letterSpacing: -0.5, fontWeight: '650' },
  /** KPI figures. Tabular numerals are applied by the component. */
  display: { fontSize: 34, lineHeight: 40, letterSpacing: -0.8, fontWeight: '700' },
} as const

export type TypographyVariant = keyof typeof typography

/**
 * Font stacks.
 *
 * System fonts are a deliberate choice: they render instantly with no layout shift, look
 * native on every platform, and avoid shipping font binaries. `mono` is reserved for
 * order numbers and identifiers, where fixed-width alignment aids scanning.
 */
export const fontFamily = {
  sans: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
  mono: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
} as const

/* -------------------------------------------------------------------------- */
/*                              Radius and borders                             */
/* -------------------------------------------------------------------------- */

export const radius = {
  none: 0,
  sm: 4,
  md: 6,
  lg: 8,
  xl: 12,
  '2xl': 16,
  '3xl': 24,
  /** Pills — badges, avatars, toggle knobs. */
  full: 9999,
} as const

export type Radius = keyof typeof radius

export const borderWidth = {
  none: 0,
  hairline: 1,
  thick: 2,
  /** Focus rings, which must be visible without shifting layout. */
  focus: 2,
} as const

/* -------------------------------------------------------------------------- */
/*                            Elevation and shadow                             */
/* -------------------------------------------------------------------------- */

/**
 * Elevation levels.
 *
 * Each level bundles the web `boxShadow`, the iOS shadow properties and the Android
 * `elevation` value together, because they must change as a set — specifying only
 * `boxShadow` produces flat cards on native, and specifying only `elevation` produces
 * flat cards on web. Components spread a whole level rather than picking properties.
 *
 * Shadows here are intentionally low-contrast and warm-tinted (they use the neutral
 * ramp's hue rather than pure black), so surfaces read as lifted paper rather than as
 * dark rectangles.
 */
export const elevation = {
  /** Flush with the page. Used for inputs and inline surfaces. */
  none: {
    boxShadow: 'none',
    shadowColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  /** Cards, table containers — the default resting surface. */
  sm: {
    boxShadow: '0 1px 2px rgba(28, 26, 24, 0.06), 0 1px 3px rgba(28, 26, 24, 0.04)',
    shadowColor: '#1C1A18',
    shadowOpacity: 0.08,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  /** Dropdowns, popovers, hovered cards. */
  md: {
    boxShadow: '0 4px 8px rgba(28, 26, 24, 0.07), 0 2px 4px rgba(28, 26, 24, 0.05)',
    shadowColor: '#1C1A18',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  /** Drawers and side panels. */
  lg: {
    boxShadow: '0 12px 24px rgba(28, 26, 24, 0.10), 0 4px 8px rgba(28, 26, 24, 0.06)',
    shadowColor: '#1C1A18',
    shadowOpacity: 0.16,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  /** Modals — the highest surface in the product. */
  xl: {
    boxShadow: '0 24px 48px rgba(28, 26, 24, 0.16), 0 8px 16px rgba(28, 26, 24, 0.08)',
    shadowColor: '#1C1A18',
    shadowOpacity: 0.24,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 24 },
    elevation: 16,
  },
} as const

export type Elevation = keyof typeof elevation

/* -------------------------------------------------------------------------- */
/*                                   Layout                                    */
/* -------------------------------------------------------------------------- */

/**
 * Layout constants and breakpoints.
 *
 * Breakpoints are consumed through `useBreakpoint()` rather than CSS media queries,
 * because React Native has no media queries — the same hook drives responsive behaviour
 * on web and native.
 */
export const layout = {
  breakpoints: {
    /** Phone. Navigation collapses to a bottom bar. */
    sm: 0,
    /** Tablet. Sidebar becomes icon-only. */
    md: 768,
    /** Laptop. Full sidebar. */
    lg: 1080,
    /** Desktop. Content is centred with a max width. */
    xl: 1440,
  },
  /** Reading measure for the main content column. */
  maxContentWidth: 1400,
  sidebarWidth: 244,
  sidebarCollapsedWidth: 68,
  topBarHeight: 60,
  /** Minimum touch target. Enforced on every interactive primitive. */
  minTouchTarget: 44,
} as const

export type Breakpoint = keyof typeof layout.breakpoints

/** Stacking order. Centralised so overlays can never be accidentally out-ordered. */
export const zIndex = {
  base: 0,
  raised: 10,
  sticky: 100,
  drawer: 200,
  modal: 300,
  popover: 400,
  toast: 500,
} as const

/* -------------------------------------------------------------------------- */
/*                                   Motion                                    */
/* -------------------------------------------------------------------------- */

/**
 * Motion tokens.
 *
 * Durations are short on purpose. This is an operations tool used repeatedly all day;
 * animation should confirm that something happened, never make the operator wait.
 */
export const motion = {
  duration: {
    instant: 80,
    fast: 140,
    normal: 200,
    slow: 320,
  },
  easing: {
    /** Default for most transitions. */
    standard: 'cubic-bezier(0.2, 0, 0, 1)',
    /** Entering the screen. */
    decelerate: 'cubic-bezier(0, 0, 0, 1)',
    /** Leaving the screen. */
    accelerate: 'cubic-bezier(0.3, 0, 1, 1)',
  },
} as const

/* -------------------------------------------------------------------------- */
/*                              Semantic colours                               */
/* -------------------------------------------------------------------------- */

/**
 * The semantic colour contract.
 *
 * Both themes must supply every key, so a component styled with semantic tokens is
 * correct in dark mode by construction — there is no code path where a component works
 * in one theme and breaks in the other.
 */
export type ThemeColors = {
  /* Surfaces, from furthest back to furthest forward */
  background: string
  backgroundSubtle: string
  surface: string
  surfaceRaised: string
  surfaceSunken: string
  surfaceHover: string
  surfaceActive: string
  surfaceDisabled: string
  /** Scrim behind modals and drawers. */
  overlay: string

  /* Borders */
  border: string
  borderSubtle: string
  borderStrong: string
  borderFocus: string

  /* Text */
  text: string
  textMuted: string
  textSubtle: string
  textDisabled: string
  /** Text on a filled primary/danger surface. */
  textInverse: string

  /* Primary action */
  primary: string
  primaryHover: string
  primaryActive: string
  primarySubtle: string
  primaryBorder: string
  primaryText: string

  /* Status: success */
  success: string
  successSubtle: string
  successBorder: string
  successText: string

  /* Status: warning */
  warning: string
  warningSubtle: string
  warningBorder: string
  warningText: string

  /* Status: danger */
  danger: string
  dangerHover: string
  dangerSubtle: string
  dangerBorder: string
  dangerText: string

  /* Status: info */
  info: string
  infoSubtle: string
  infoBorder: string
  infoText: string

  /* Status: neutral (completed, archived) */
  neutral: string
  neutralSubtle: string
  neutralBorder: string
  neutralText: string

  /** Skeleton loading base and highlight. */
  skeleton: string
  skeletonHighlight: string
}

export const lightColors: ThemeColors = {
  background: palette.neutral[100],
  backgroundSubtle: palette.neutral[50],
  surface: palette.neutral[0],
  surfaceRaised: palette.neutral[0],
  surfaceSunken: palette.neutral[100],
  surfaceHover: palette.neutral[50],
  surfaceActive: palette.neutral[100],
  surfaceDisabled: palette.neutral[100],
  overlay: 'rgba(28, 26, 24, 0.44)',

  border: palette.neutral[200],
  borderSubtle: palette.neutral[100],
  borderStrong: palette.neutral[300],
  borderFocus: palette.teal[500],

  text: palette.neutral[900],
  textMuted: palette.neutral[600],
  textSubtle: palette.neutral[500],
  textDisabled: palette.neutral[400],
  textInverse: palette.neutral[0],

  primary: palette.teal[600],
  primaryHover: palette.teal[700],
  primaryActive: palette.teal[800],
  primarySubtle: palette.teal[50],
  primaryBorder: palette.teal[200],
  primaryText: palette.teal[700],

  success: palette.green[600],
  successSubtle: palette.green[50],
  successBorder: palette.green[200],
  successText: palette.green[700],

  warning: palette.amber[500],
  warningSubtle: palette.amber[50],
  warningBorder: palette.amber[200],
  warningText: palette.amber[700],

  danger: palette.red[600],
  dangerHover: palette.red[700],
  dangerSubtle: palette.red[50],
  dangerBorder: palette.red[200],
  dangerText: palette.red[700],

  info: palette.blue[600],
  infoSubtle: palette.blue[50],
  infoBorder: palette.blue[200],
  infoText: palette.blue[700],

  neutral: palette.neutral[500],
  neutralSubtle: palette.neutral[100],
  neutralBorder: palette.neutral[300],
  neutralText: palette.neutral[600],

  skeleton: palette.neutral[200],
  skeletonHighlight: palette.neutral[100],
}

/**
 * Dark theme.
 *
 * Not an inversion of the light theme. Two things change independently:
 *
 * - Surfaces get *lighter* as they come forward (900 -> 800), the opposite of light mode
 *   where they get lighter going back. Elevation in the dark is communicated by
 *   luminance, because shadows are nearly invisible against a dark ground.
 * - Accent colours step *down* the ramp (600 -> 400). A 600-step teal that reads as
 *   confident on white is muddy and low-contrast on near-black.
 */
export const darkColors: ThemeColors = {
  background: palette.neutral[950],
  backgroundSubtle: palette.neutral[900],
  surface: palette.neutral[900],
  surfaceRaised: palette.neutral[800],
  surfaceSunken: palette.neutral[950],
  surfaceHover: palette.neutral[800],
  surfaceActive: palette.neutral[700],
  surfaceDisabled: palette.neutral[800],
  overlay: 'rgba(0, 0, 0, 0.66)',

  border: palette.neutral[800],
  borderSubtle: palette.neutral[900],
  borderStrong: palette.neutral[700],
  borderFocus: palette.teal[400],

  text: palette.neutral[50],
  textMuted: palette.neutral[400],
  textSubtle: palette.neutral[500],
  textDisabled: palette.neutral[600],
  textInverse: palette.neutral[950],

  primary: palette.teal[400],
  primaryHover: palette.teal[300],
  primaryActive: palette.teal[200],
  primarySubtle: 'rgba(60, 182, 160, 0.14)',
  primaryBorder: palette.teal[800],
  primaryText: palette.teal[300],

  success: palette.green[400],
  successSubtle: 'rgba(76, 181, 108, 0.14)',
  successBorder: palette.green[800],
  successText: palette.green[300],

  warning: palette.amber[400],
  warningSubtle: 'rgba(222, 158, 50, 0.14)',
  warningBorder: palette.amber[800],
  warningText: palette.amber[300],

  danger: palette.red[400],
  dangerHover: palette.red[300],
  dangerSubtle: 'rgba(226, 122, 110, 0.14)',
  dangerBorder: palette.red[800],
  dangerText: palette.red[300],

  info: palette.blue[400],
  infoSubtle: 'rgba(98, 149, 225, 0.14)',
  infoBorder: palette.blue[800],
  infoText: palette.blue[300],

  neutral: palette.neutral[500],
  neutralSubtle: palette.neutral[800],
  neutralBorder: palette.neutral[700],
  neutralText: palette.neutral[400],

  skeleton: palette.neutral[800],
  skeletonHighlight: palette.neutral[700],
}

/* -------------------------------------------------------------------------- */
/*                                    Theme                                    */
/* -------------------------------------------------------------------------- */

export type ThemeMode = 'light' | 'dark'

export type Theme = {
  mode: ThemeMode
  color: ThemeColors
  spacing: typeof spacing
  typography: typeof typography
  fontFamily: typeof fontFamily
  radius: typeof radius
  borderWidth: typeof borderWidth
  elevation: typeof elevation
  layout: typeof layout
  zIndex: typeof zIndex
  motion: typeof motion
}

const shared = {
  spacing,
  typography,
  fontFamily,
  radius,
  borderWidth,
  elevation,
  layout,
  zIndex,
  motion,
} as const

export const lightTheme: Theme = { mode: 'light', color: lightColors, ...shared }
export const darkTheme: Theme = { mode: 'dark', color: darkColors, ...shared }

export const themes: Record<ThemeMode, Theme> = {
  light: lightTheme,
  dark: darkTheme,
}

/* -------------------------------------------------------------------------- */
/*                              Semantic tones                                 */
/* -------------------------------------------------------------------------- */

/**
 * The tone vocabulary shared by Badge, Alert, Toast and StatusDot.
 *
 * A single list means a new status colour cannot be introduced in one component without
 * every other component gaining it too — which is precisely how design systems stay
 * consistent as they grow.
 */
export const TONES = ['neutral', 'primary', 'success', 'warning', 'danger', 'info'] as const

export type Tone = (typeof TONES)[number]

/** Resolve a tone to its surface / border / text triple in the current theme. */
export function toneColors(theme: Theme, tone: Tone) {
  switch (tone) {
    case 'primary':
      return {
        background: theme.color.primarySubtle,
        border: theme.color.primaryBorder,
        text: theme.color.primaryText,
        solid: theme.color.primary,
      }
    case 'success':
      return {
        background: theme.color.successSubtle,
        border: theme.color.successBorder,
        text: theme.color.successText,
        solid: theme.color.success,
      }
    case 'warning':
      return {
        background: theme.color.warningSubtle,
        border: theme.color.warningBorder,
        text: theme.color.warningText,
        solid: theme.color.warning,
      }
    case 'danger':
      return {
        background: theme.color.dangerSubtle,
        border: theme.color.dangerBorder,
        text: theme.color.dangerText,
        solid: theme.color.danger,
      }
    case 'info':
      return {
        background: theme.color.infoSubtle,
        border: theme.color.infoBorder,
        text: theme.color.infoText,
        solid: theme.color.info,
      }
    case 'neutral':
    default:
      return {
        background: theme.color.neutralSubtle,
        border: theme.color.neutralBorder,
        text: theme.color.neutralText,
        solid: theme.color.neutral,
      }
  }
}
