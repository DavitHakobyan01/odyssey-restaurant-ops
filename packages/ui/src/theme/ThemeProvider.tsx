/**
 * Theme distribution and the hooks components use to reach it.
 *
 * `useTheme()` is the only way a component obtains colours or scales. Because the theme
 * object satisfies a total `ThemeColors` contract, a component written against semantic
 * tokens is automatically correct in dark mode — there is no separate dark-mode styling
 * pass and no opportunity for the two to drift.
 */
import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useColorScheme, useWindowDimensions } from 'react-native'

import { layout, themes, type Breakpoint, type Theme, type ThemeMode } from '../tokens'

/** 'system' follows the OS setting; the others pin the theme. */
export type ThemePreference = ThemeMode | 'system'

type ThemeContextValue = {
  theme: Theme
  /** The resolved mode actually in use. */
  mode: ThemeMode
  /** What the user asked for, which may be 'system'. */
  preference: ThemePreference
  setPreference: (preference: ThemePreference) => void
  /** Convenience for a toggle control; always resolves to an explicit mode. */
  toggleMode: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export type ThemeProviderProps = {
  children: ReactNode
  /** Initial preference. Defaults to following the operating system. */
  initialPreference?: ThemePreference
}

export function ThemeProvider({ children, initialPreference = 'system' }: ThemeProviderProps) {
  const systemScheme = useColorScheme()
  const [preference, setPreference] = useState<ThemePreference>(initialPreference)

  const mode: ThemeMode =
    preference === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : preference

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme: themes[mode],
      mode,
      preference,
      setPreference,
      toggleMode: () => setPreference(mode === 'dark' ? 'light' : 'dark'),
    }),
    [mode, preference],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

/**
 * Access the active theme.
 *
 * Throws rather than falling back to a default theme: a component rendering outside the
 * provider would silently render with the wrong colours, which is far harder to notice
 * than an immediate, explicit error.
 */
export function useTheme(): Theme {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme() must be used inside <ThemeProvider>. Wrap your app root in it.')
  }
  return context.theme
}

/** Theme controls, for a settings screen or a mode toggle. */
export function useThemeControls() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useThemeControls() must be used inside <ThemeProvider>.')
  }
  const { mode, preference, setPreference, toggleMode } = context
  return { mode, preference, setPreference, toggleMode }
}

/* -------------------------------------------------------------------------- */
/*                                Responsiveness                               */
/* -------------------------------------------------------------------------- */

/**
 * The current breakpoint, derived from window width.
 *
 * React Native has no media queries, so responsive behaviour is expressed in JS. Using
 * one hook for both platforms means the dashboard's layout rules are written once and a
 * native build gets the correct behaviour for free.
 */
export function useBreakpoint(): Breakpoint {
  const { width } = useWindowDimensions()

  if (width >= layout.breakpoints.xl) return 'xl'
  if (width >= layout.breakpoints.lg) return 'lg'
  if (width >= layout.breakpoints.md) return 'md'
  return 'sm'
}

/** True at or above the given breakpoint — reads naturally at call sites. */
export function useMinBreakpoint(min: Breakpoint): boolean {
  const { width } = useWindowDimensions()
  return width >= layout.breakpoints[min]
}
