/**
 * RevenueChart edge cases.
 *
 * Charts are a classic source of NaN coordinates and divide-by-zero: an all-zero series
 * has no range to scale against, and a single bucket has no horizontal span. Both are
 * ordinary states here — a brand-new database returns all zeros, and the "today" range
 * early in service returns one bucket — so they are tested rather than assumed.
 */
import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'

import { ThemeProvider } from '@odyssey/ui'

import { RevenueChart } from '../src/features/home/RevenueChart'

const ISO = '2026-08-13T10:00:00.000Z'

function renderChart(ui: ReactNode) {
  return render(<ThemeProvider initialPreference="light">{ui}</ThemeProvider>)
}

/** Any NaN reaching an SVG path attribute makes the whole path silently fail to draw. */
function expectNoNaN(container: HTMLElement) {
  expect(container.innerHTML).not.toContain('NaN')
  expect(container.innerHTML).not.toContain('Infinity')
}

describe('RevenueChart', () => {
  it('renders an empty series without crashing', () => {
    const { container } = renderChart(<RevenueChart data={[]} />)
    expectNoNaN(container)
  })

  it('renders an all-zero series at the baseline rather than dividing by zero', () => {
    const data = Array.from({ length: 7 }, () => ({
      bucket: ISO,
      revenueCents: 0,
      orderCount: 0,
    }))

    const { container, getByText } = renderChart(<RevenueChart data={data} />)

    expectNoNaN(container)
    // Says so explicitly rather than showing a misleading flat line with no explanation.
    expect(getByText('No revenue recorded in this range yet.')).toBeInTheDocument()
  })

  it('renders a single bucket without producing a zero-width step', () => {
    const { container } = renderChart(
      <RevenueChart data={[{ bucket: ISO, revenueCents: 4200, orderCount: 2 }]} />,
    )
    expectNoNaN(container)
  })

  it('reports the peak of the series', () => {
    const { getByText } = renderChart(
      <RevenueChart
        data={[
          { bucket: ISO, revenueCents: 1000, orderCount: 1 },
          { bucket: ISO, revenueCents: 250_000, orderCount: 9 },
        ]}
      />,
    )
    expect(getByText('Peak $2,500.00')).toBeInTheDocument()
  })

  it('keeps zero buckets in the series instead of dropping them', () => {
    // A dropped zero bucket would let the line interpolate across a closed day and imply
    // revenue that never happened.
    const { getByText } = renderChart(
      <RevenueChart
        data={[
          { bucket: ISO, revenueCents: 5000, orderCount: 2 },
          { bucket: ISO, revenueCents: 0, orderCount: 0 },
          { bucket: ISO, revenueCents: 7000, orderCount: 3 },
        ]}
      />,
    )
    expect(getByText('3 buckets')).toBeInTheDocument()
  })
})
