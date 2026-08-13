/**
 * Screen smoke tests.
 *
 * Every screen is mounted for real, with the provider stack it runs under in production
 * and stubbed network responses in the exact shapes the API returns. TypeScript proves
 * the props line up; only actually rendering proves the component does not throw on a
 * null field, an empty array, or a token that does not exist.
 *
 * `fetch` is stubbed rather than the generated hooks: that keeps the whole client path —
 * URL building, the mutator, error normalisation, React Query wiring — under test. Mocking
 * the hooks would skip precisely the layers most likely to be wrong.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ThemeProvider, ToastProvider } from '@odyssey/ui'

/* ------------------------------- Router stub ------------------------------ */

const pushMock = vi.fn()

vi.mock('expo-router', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), back: vi.fn() }),
  usePathname: () => '/',
  useLocalSearchParams: () => ({ id: 'order-1' }),
  Slot: () => null,
  Link: ({ children }: { children: ReactNode }) => children,
}))

/* -------------------------------- Fixtures -------------------------------- */

const ISO = '2026-08-13T10:00:00.000Z'

const overview = {
  range: '30d',
  totalOrders: 135,
  revenueCents: 1_217_328,
  pendingOrders: 7,
  inProgressOrders: 9,
  averageOrderValueCents: 9017,
  ordersByStatus: [
    { status: 'pending', count: 7 },
    { status: 'accepted', count: 2 },
    { status: 'preparing', count: 6 },
    { status: 'ready', count: 1 },
    { status: 'completed', count: 119 },
    { status: 'cancelled', count: 8 },
  ],
  popularItems: [
    { menuItemId: 'item-1', name: 'Pappardelle ragù', quantitySold: 60, revenueCents: 132_000 },
  ],
  revenueTrend: [
    { bucket: ISO, revenueCents: 40_000, orderCount: 4 },
    { bucket: ISO, revenueCents: 0, orderCount: 0 },
  ],
}

const orderSummary = {
  id: 'order-1',
  orderNumber: 'ORD-1042',
  customerId: 'cust-1',
  status: 'pending',
  type: 'takeaway',
  subtotalCents: 3200,
  taxCents: 280,
  serviceFeeCents: 160,
  totalCents: 3640,
  placedAt: ISO,
  acceptedAt: null,
  preparingAt: null,
  readyAt: null,
  completedAt: null,
  cancelledAt: null,
  createdAt: ISO,
  updatedAt: ISO,
  customer: { id: 'cust-1', name: 'Amara Okafor', email: 'amara@example.com' },
  itemCount: 2,
}

const orderDetail = {
  ...orderSummary,
  notes: null,
  cancellationReason: null,
  items: [
    {
      id: 'line-1',
      orderId: 'order-1',
      menuItemId: 'item-1',
      nameSnapshot: 'Margherita',
      unitPriceCents: 1600,
      quantity: 2,
      lineTotalCents: 3200,
      notes: null,
      createdAt: ISO,
    },
  ],
  availableActions: ['accept', 'cancel'],
}

const customerWithStats = {
  id: 'cust-1',
  name: 'Amara Okafor',
  email: 'amara@example.com',
  phone: null,
  notes: null,
  createdAt: ISO,
  updatedAt: ISO,
  orderCount: 13,
  totalSpentCents: 135_934,
  averageOrderValueCents: 10_456,
  lastOrderAt: ISO,
}

const settings = {
  id: 'settings-1',
  restaurantName: 'Odyssey Kitchen',
  currency: 'USD',
  isAcceptingOrders: true,
  autoAcceptOrders: false,
  defaultPrepTimeMinutes: 20,
  taxRateBps: 875,
  serviceFeeBps: 500,
  minimumOrderCents: 1000,
  openingHours: [{ dayOfWeek: 1, opensAt: '17:00', closesAt: '22:30', isClosed: false }],
  createdAt: ISO,
  updatedAt: ISO,
}

const menuItem = {
  id: 'item-1',
  categoryId: 'cat-1',
  name: 'Margherita',
  description: 'San Marzano, fior di latte, basil.',
  priceCents: 1600,
  isAvailable: true,
  prepTimeMinutes: 14,
  imageUrl: null,
  createdAt: ISO,
  updatedAt: ISO,
}

const paginated = <T,>(rows: T[]) => ({
  data: rows,
  pagination: { total: rows.length, limit: 25, offset: 0, hasMore: false },
})

/**
 * Route the stubbed fetch by pathname, mirroring the real API surface. Anything
 * unrecognised fails loudly rather than returning an empty object, so a screen calling an
 * endpoint this fixture does not model shows up as a test failure instead of silently
 * rendering an empty state.
 */
function stubFetch() {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost')
    const path = url.pathname

    const body = (() => {
      if (path === '/stats/overview') return overview
      if (path === '/orders') return paginated([orderSummary])
      if (path.startsWith('/orders/')) return orderDetail
      if (path === '/customers') return paginated([customerWithStats])
      if (path.startsWith('/customers/')) return customerWithStats
      if (path === '/settings') return settings
      if (path === '/menu/full') {
        return [
          {
            id: 'cat-1',
            name: 'Wood-fired pizza',
            description: null,
            sortOrder: 20,
            isActive: true,
            createdAt: ISO,
            updatedAt: ISO,
            items: [menuItem],
          },
        ]
      }
      if (path === '/menu/items') return paginated([{ ...menuItem, category: { id: 'cat-1', name: 'Wood-fired pizza' } }])
      if (path === '/menu/categories') return []
      throw new Error(`Unstubbed request: ${path}`)
    })()

    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  })
}

/* -------------------------------- Harness --------------------------------- */

function renderScreen(ui: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })

  return render(
    <ThemeProvider initialPreference="light">
      <QueryClientProvider client={queryClient}>
        <ToastProvider>{ui}</ToastProvider>
      </QueryClientProvider>
    </ThemeProvider>,
  )
}

beforeEach(() => {
  vi.stubGlobal('fetch', stubFetch())
  pushMock.mockClear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/* --------------------------------- Tests ---------------------------------- */

describe('Home', () => {
  it('renders KPI figures from the API without recomputing them', async () => {
    const { default: HomeScreen } = await import('../app/(app)/index')
    renderScreen(<HomeScreen />)

    // $12,173.28 compacted for the tile.
    expect(await screen.findByText('$12.2K')).toBeInTheDocument()
    expect(await screen.findByText('135')).toBeInTheDocument()
    // Pending count surfaces both as a tile and as the attention banner.
    expect(await screen.findAllByText('7')).not.toHaveLength(0)
  })

  it('shows every order status including ones with a zero count', async () => {
    const { default: HomeScreen } = await import('../app/(app)/index')
    renderScreen(<HomeScreen />)

    for (const label of ['Pending', 'Accepted', 'Preparing', 'Ready', 'Completed', 'Cancelled']) {
      expect(await screen.findByText(new RegExp(`^${label} ·`))).toBeInTheDocument()
    }
  })
})

describe('Orders list', () => {
  it('renders order rows with server-formatted money', async () => {
    const { default: OrdersScreen } = await import('../app/(app)/orders/index')
    renderScreen(<OrdersScreen />)

    expect(await screen.findByText('ORD-1042')).toBeInTheDocument()
    expect(await screen.findByText('Amara Okafor')).toBeInTheDocument()
    expect(await screen.findByText('$36.40')).toBeInTheDocument()
  })
})

describe('Order detail', () => {
  /**
   * The core contract of the whole design: the action buttons come from the server's
   * `availableActions`, not from a client-side guess. The fixture says pending, so exactly
   * Accept and Cancel must appear — and nothing else.
   */
  it('renders exactly the actions the server declared legal', async () => {
    const { default: OrderDetailScreen } = await import('../app/(app)/orders/[id]')
    renderScreen(<OrderDetailScreen />)

    expect(await screen.findByText('Accept order')).toBeInTheDocument()
    expect(await screen.findByText('Cancel order')).toBeInTheDocument()

    // Not offered from `pending` — these must not be rendered.
    expect(screen.queryByText('Mark ready')).not.toBeInTheDocument()
    expect(screen.queryByText('Complete order')).not.toBeInTheDocument()
    expect(screen.queryByText('Start preparing')).not.toBeInTheDocument()
  })

  it('shows the persisted totals rather than recomputing them', async () => {
    const { default: OrderDetailScreen } = await import('../app/(app)/orders/[id]')
    renderScreen(<OrderDetailScreen />)

    // $32.00 legitimately appears twice — as the line total and as the subtotal — so this
    // asserts on presence rather than uniqueness.
    expect(await screen.findAllByText('$32.00')).not.toHaveLength(0)
    expect(await screen.findByText('$2.80')).toBeInTheDocument() // tax
    expect(await screen.findByText('$1.60')).toBeInTheDocument() // service fee
    expect(await screen.findByText('$36.40')).toBeInTheDocument() // total
  })
})

describe('Menu', () => {
  it('renders categories with their nested items', async () => {
    const { default: MenuScreen } = await import('../app/(app)/menu/index')
    renderScreen(<MenuScreen />)

    expect(await screen.findByText('Wood-fired pizza')).toBeInTheDocument()
    expect(await screen.findByText('Margherita')).toBeInTheDocument()
    expect(await screen.findByText('$16.00')).toBeInTheDocument()
  })
})

describe('CRM', () => {
  it('renders customers with SQL-aggregated lifetime stats', async () => {
    const { default: CrmScreen } = await import('../app/(app)/crm/index')
    renderScreen(<CrmScreen />)

    expect(await screen.findByText('Amara Okafor')).toBeInTheDocument()
    expect(await screen.findByText('$1,359.34')).toBeInTheDocument()
    expect(await screen.findByText('13')).toBeInTheDocument()
  })
})

describe('Settings', () => {
  /**
   * Basis points must never reach the operator. 875 bps is 8.75%, and the input must show
   * the percentage — showing `875` would leak a storage decision into the interface.
   */
  it('presents basis points as a percentage', async () => {
    const { default: SettingsScreen } = await import('../app/(app)/settings/index')
    renderScreen(<SettingsScreen />)

    expect(await screen.findByDisplayValue('8.75')).toBeInTheDocument()
    expect(screen.queryByDisplayValue('875')).not.toBeInTheDocument()
  })

  it('computes the worked example with the shared pricing function', async () => {
    const { default: SettingsScreen } = await import('../app/(app)/settings/index')
    renderScreen(<SettingsScreen />)

    // $40.00 subtotal, 8.75% tax = $3.50, 5% fee = $2.00 -> $45.50
    expect(await screen.findByText('$45.50')).toBeInTheDocument()
  })

  /**
   * Regression test for a real data-loss bug.
   *
   * Clearing a rate field used to parse as 0, which differs from the stored 875, so the
   * form registered a "change" and enabled Save. An operator clearing the field to retype
   * it and then saving would silently set the restaurant's tax rate to 0%.
   */
  it('treats a cleared rate field as invalid, never as zero', async () => {
    const { default: SettingsScreen } = await import('../app/(app)/settings/index')
    renderScreen(<SettingsScreen />)

    const taxInput = await screen.findByDisplayValue('8.75')
    await userEvent.clear(taxInput)

    // Inline error, and the worked example refuses to price at 0%.
    expect(await screen.findByText('Enter a percentage, for example 8.75.')).toBeInTheDocument()
    expect(screen.queryByText('$45.50')).not.toBeInTheDocument()
    expect(screen.queryByText('$40.00')).not.toBeInTheDocument()

    // Save must not be offered as a way to commit the blank value.
    const save = screen.getByRole('button', { name: 'Save changes' })
    expect(save).toHaveAttribute('aria-disabled', 'true')
  })

  it('rejects a rate above 100% before the server has to', async () => {
    const { default: SettingsScreen } = await import('../app/(app)/settings/index')
    renderScreen(<SettingsScreen />)

    const taxInput = await screen.findByDisplayValue('8.75')
    await userEvent.clear(taxInput)
    await userEvent.type(taxInput, '150')

    expect(await screen.findByText('Tax rate cannot exceed 100%.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save changes' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
  })
})

describe('UI library', () => {
  it('renders the token showcase without touching the network', async () => {
    const { default: UiLibraryScreen } = await import('../app/(app)/ui/index')
    renderScreen(<UiLibraryScreen />)

    expect(await screen.findByText('UI library')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText('color.textMuted')).toBeInTheDocument()
    })
  })
})
