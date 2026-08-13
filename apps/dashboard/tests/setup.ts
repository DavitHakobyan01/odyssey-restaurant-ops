/**
 * Frontend test setup.
 *
 * Adds jest-dom matchers and stubs the browser APIs that react-native-web expects but
 * jsdom does not implement.
 */
import '@testing-library/jest-dom/vitest'

import { cleanup } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { afterEach, vi } from 'vitest'

/**
 * Stub `react-native-safe-area-context`.
 *
 * Like react-native-svg, it publishes source Vite's SSR transform cannot parse, so any
 * module importing it fails to load with `SyntaxError: Unexpected token 'typeof'` —
 * which is every screen, because AppShell reads the safe-area insets.
 *
 * Zero insets are the correct value for a desktop browser anyway; the insets only matter
 * on a notched device, which jsdom is not.
 */
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  useSafeAreaFrame: () => ({ x: 0, y: 0, width: 375, height: 812 }),
  SafeAreaProvider: ({ children }: { children: ReactNode }) => children,
  SafeAreaView: ({ children }: { children: ReactNode }) => children,
  initialWindowMetrics: {
    frame: { x: 0, y: 0, width: 375, height: 812 },
    insets: { top: 0, right: 0, bottom: 0, left: 0 },
  },
}))

/**
 * Stub `react-native-svg`.
 *
 * The package publishes `"react-native": "src/index.ts"` (untranspiled source) and a
 * compiled build that Vite's SSR transform still cannot parse. Either entry point makes
 * every screen importing an icon fail to load, so none of them could be tested at all.
 *
 * Icons are decorative here — the assertions in these suites are about text, money
 * formatting and which actions render, none of which depend on SVG path data. Stubbing
 * the primitives keeps the screens testable while leaving the real library in the app,
 * where Metro bundles it correctly (verified against the running dev server).
 *
 * The elements still render their children, so an icon wrapping content is not silently
 * dropped from the tree.
 */
vi.mock('react-native-svg', () => {
  const stub = (name: string) => {
    const Component = ({ children }: { children?: ReactNode }) =>
      createElement('span', { 'data-svg': name }, children)
    Component.displayName = `MockSvg(${name})`
    return Component
  }

  const Svg = stub('Svg')

  return {
    default: Svg,
    Svg,
    Path: stub('Path'),
    Circle: stub('Circle'),
    Rect: stub('Rect'),
    Line: stub('Line'),
    G: stub('G'),
    Defs: stub('Defs'),
    LinearGradient: stub('LinearGradient'),
    Stop: stub('Stop'),
    Polyline: stub('Polyline'),
    Polygon: stub('Polygon'),
    Ellipse: stub('Ellipse'),
    Text: stub('Text'),
    TSpan: stub('TSpan'),
    ClipPath: stub('ClipPath'),
    Mask: stub('Mask'),
    Use: stub('Use'),
  }
})

// Unmount between tests so a leaked component cannot affect the next assertion.
afterEach(() => {
  cleanup()
})

/**
 * jsdom has no matchMedia. react-native-web's Appearance module uses it to resolve the
 * colour scheme, so ThemeProvider would throw on mount without this.
 * Defaults to light; a test can override the `matches` value to assert dark mode.
 */
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

/** Animated and some layout code paths expect these to exist. */
if (!window.requestAnimationFrame) {
  window.requestAnimationFrame = ((callback: FrameRequestCallback) =>
    setTimeout(() => callback(Date.now()), 0)) as typeof window.requestAnimationFrame
  window.cancelAnimationFrame = ((handle: number) =>
    clearTimeout(handle)) as typeof window.cancelAnimationFrame
}
