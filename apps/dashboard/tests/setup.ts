/**
 * Frontend test setup.
 *
 * Adds jest-dom matchers and stubs the browser APIs that react-native-web expects but
 * jsdom does not implement.
 */
import '@testing-library/jest-dom/vitest'

import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

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
