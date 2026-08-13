/**
 * Design system behaviour tests.
 *
 * These assert the properties the whole system rests on — the ones that would silently
 * rot as components are added. Rendering through react-native-web in jsdom means we are
 * asserting on the same output the browser receives.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import {
  Badge,
  Button,
  EmptyState,
  Text,
  ThemeProvider,
  darkTheme,
  lightTheme,
  toneColors,
  TONES,
} from '@odyssey/ui'

function renderWithTheme(ui: ReactNode) {
  return render(<ThemeProvider initialPreference="light">{ui}</ThemeProvider>)
}

describe('Button', () => {
  it('renders its label and fires onPress', async () => {
    const onPress = vi.fn()
    renderWithTheme(<Button onPress={onPress}>Accept order</Button>)

    const button = screen.getByRole('button', { name: 'Accept order' })
    await userEvent.click(button)

    expect(onPress).toHaveBeenCalledTimes(1)
  })

  /**
   * `pointerEventsCheck: 0` is deliberate.
   *
   * A disabled button carries `pointer-events: none`, and user-event refuses to simulate
   * a click on such an element — which is itself evidence the guard works. Disabling that
   * check forces the click through anyway, so the assertion tests the stronger property:
   * even if an event did reach the element, the handler is not wired up.
   */
  it('does not fire when disabled, even if a click is forced through', async () => {
    const onPress = vi.fn()
    renderWithTheme(
      <Button onPress={onPress} disabled>
        Accept order
      </Button>,
    )

    const button = screen.getByRole('button', { name: 'Accept order' })
    expect(button).toHaveStyle({ pointerEvents: 'none' })

    await userEvent.click(button, { pointerEventsCheck: 0 })
    expect(onPress).not.toHaveBeenCalled()
  })

  /**
   * The important one. A loading button that still fires would let an operator submit the
   * same order twice by double-clicking, which the backend would happily accept as two
   * distinct orders.
   */
  it('does not fire while loading, even on a double click', async () => {
    const onPress = vi.fn()
    renderWithTheme(
      <Button onPress={onPress} loading>
        Create order
      </Button>,
    )

    const button = screen.getByRole('button', { name: 'Create order' })
    await userEvent.dblClick(button, { pointerEventsCheck: 0 })

    expect(onPress).not.toHaveBeenCalled()
  })

  it('keeps the label mounted while loading so the button does not resize', () => {
    renderWithTheme(<Button loading>Create order</Button>)
    // Present in the tree (transparent), not unmounted — this is what stops a toolbar
    // reflowing when one button starts working.
    expect(screen.getByText('Create order')).toBeInTheDocument()
  })

  it('marks itself busy for assistive technology while loading', () => {
    renderWithTheme(<Button loading>Create order</Button>)
    expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'true')
  })
})

describe('Text', () => {
  it('renders its children', () => {
    renderWithTheme(<Text>Total revenue</Text>)
    expect(screen.getByText('Total revenue')).toBeInTheDocument()
  })

  it('applies tabular numerals when numeric, so table columns align', () => {
    renderWithTheme(<Text numeric>$1,234.56</Text>)
    const node = screen.getByText('$1,234.56')
    expect(node).toHaveStyle({ fontVariant: 'tabular-nums' })
  })
})

describe('Badge', () => {
  it('renders every tone without throwing', () => {
    for (const tone of TONES) {
      const { unmount } = renderWithTheme(<Badge tone={tone}>{tone}</Badge>)
      expect(screen.getByText(tone)).toBeInTheDocument()
      unmount()
    }
  })
})

describe('EmptyState', () => {
  it('renders a title and description', () => {
    renderWithTheme(<EmptyState title="No orders yet" description="Orders will appear here." />)

    expect(screen.getByText('No orders yet')).toBeInTheDocument()
    expect(screen.getByText('Orders will appear here.')).toBeInTheDocument()
  })
})

/**
 * Theme contract tests.
 *
 * These are what make "dark mode works by construction" a fact rather than a hope: if
 * both themes must satisfy the same total key set, a component styled from semantic
 * tokens cannot be broken in one theme and fine in the other.
 */
describe('theme contract', () => {
  it('defines exactly the same token keys in light and dark', () => {
    expect(Object.keys(darkTheme.color).sort()).toEqual(Object.keys(lightTheme.color).sort())
  })

  it('gives every colour token a non-empty value in both themes', () => {
    for (const theme of [lightTheme, darkTheme]) {
      for (const [token, value] of Object.entries(theme.color)) {
        expect(value, `${theme.mode}.${token}`).toBeTruthy()
      }
    }
  })

  it('actually differs between themes rather than being a copy', () => {
    expect(darkTheme.color.background).not.toBe(lightTheme.color.background)
    expect(darkTheme.color.text).not.toBe(lightTheme.color.text)
  })

  it('shares the non-colour scales, so spacing and type are theme-independent', () => {
    expect(darkTheme.spacing).toBe(lightTheme.spacing)
    expect(darkTheme.typography).toBe(lightTheme.typography)
    expect(darkTheme.radius).toBe(lightTheme.radius)
  })

  it('resolves every tone to a full colour set in both themes', () => {
    for (const theme of [lightTheme, darkTheme]) {
      for (const tone of TONES) {
        const colors = toneColors(theme, tone)
        expect(colors.background, `${theme.mode}/${tone}`).toBeTruthy()
        expect(colors.border).toBeTruthy()
        expect(colors.text).toBeTruthy()
        expect(colors.solid).toBeTruthy()
      }
    }
  })
})
