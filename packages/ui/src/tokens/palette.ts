/**
 * Raw colour ramps — the only place literal hex values appear in the entire codebase.
 *
 * Nothing outside the token layer imports from this file. Components consume *semantic*
 * colours (`theme.color.textMuted`, `theme.color.borderStrong`) rather than palette
 * steps, which is what allows the light and dark themes to be genuinely different
 * mappings rather than one being a mechanical inversion of the other.
 *
 * Ramp convention: 50 is lightest, 900 darkest. Steps are tuned so that
 * `{hue}600 on {hue}50` and `white on {hue}600` both clear WCAG AA for body text.
 *
 * Hue strategy
 * ------------
 * The neutral ramp is warm (a few degrees toward orange) rather than pure grey. Against
 * a pure-grey UI the food photography and status colours read as slightly clinical; the
 * warmth is subtle enough to feel like paper rather than tinted.
 *
 * Primary is teal. It has to coexist with four status hues — amber, red, green, blue —
 * without being confusable with any of them at a glance, and it has to feel appropriate
 * for hospitality. Teal sits far enough from amber and red to survive peripheral vision,
 * and is separated from success-green by both hue and context (primary appears on
 * actions, success only on state).
 */

export const palette = {
  /** Warm neutrals. The surface and text foundation of the whole UI. */
  neutral: {
    0: '#FFFFFF',
    50: '#FAF9F7',
    100: '#F4F2EF',
    200: '#E8E5E0',
    300: '#D6D1CA',
    400: '#B0A99F',
    500: '#8A8279',
    600: '#6B645C',
    700: '#4F4943',
    800: '#332F2B',
    900: '#1C1A18',
    950: '#111010',
  },

  /** Primary — actions, links, focus, selected state. */
  teal: {
    50: '#EDFAF7',
    100: '#D2F2EB',
    200: '#A6E5D8',
    300: '#6FD1BE',
    400: '#3CB6A0',
    500: '#1E9986',
    600: '#137D6E',
    700: '#116459',
    800: '#124F47',
    900: '#11413B',
  },

  /** Success — completed orders, saved settings, positive deltas. */
  green: {
    50: '#EFFAF1',
    100: '#D7F2DD',
    200: '#B0E5BD',
    300: '#7CD094',
    400: '#4CB56C',
    500: '#2E9950',
    600: '#207A3F',
    700: '#1C6134',
    800: '#1A4E2C',
    900: '#164026',
  },

  /** Warning — pending orders, unsaved changes, approaching limits. */
  amber: {
    50: '#FDF7EC',
    100: '#FAEBCD',
    200: '#F4D69B',
    300: '#EBBA5F',
    400: '#DE9E32',
    500: '#C6821B',
    600: '#A26514',
    700: '#824F15',
    800: '#6A4017',
    900: '#583616',
  },

  /** Danger — cancellations, destructive actions, validation failures. */
  red: {
    50: '#FDF3F2',
    100: '#FBE3E1',
    200: '#F7CBC7',
    300: '#EFA79F',
    400: '#E27A6E',
    500: '#D05446',
    600: '#B63A2F',
    700: '#982F27',
    800: '#7E2A24',
    900: '#6A2723',
  },

  /** Info — in-progress states, neutral notices, secondary emphasis. */
  blue: {
    50: '#EFF5FD',
    100: '#DBE8FA',
    200: '#BED5F5',
    300: '#93B9ED',
    400: '#6295E1',
    500: '#4076D2',
    600: '#2F5CB8',
    700: '#294B95',
    800: '#264178',
    900: '#243862',
  },
} as const

export type Palette = typeof palette
