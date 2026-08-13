/**
 * Revenue trend chart.
 *
 * Drawn directly with react-native-svg rather than pulling in a charting library: the
 * requirement is one area chart, and every RN-compatible charting package would add
 * significant weight plus its own theming model that would then need reconciling with
 * the design tokens.
 *
 * Two correctness details that a naive implementation gets wrong:
 *
 *  - **Zero-revenue buckets are drawn at the baseline, not skipped.** The API deliberately
 *    returns every bucket including empty ones (it uses generate_series) so the line
 *    cannot interpolate across a closed day and imply revenue that never happened.
 *  - **A flat series does not divide by zero.** When every bucket is equal (commonly all
 *    zero on a fresh database) the range is 0, so the scale falls back to a flat baseline
 *    instead of producing NaN coordinates and an invisible chart.
 */
import { useMemo } from 'react'
import { View } from 'react-native'
import Svg, { Defs, LinearGradient, Path, Stop, Line as SvgLine } from 'react-native-svg'

import type { DashboardOverviewRevenueTrendItem } from '@odyssey/api-client'
import { formatMoneyCompact } from '@odyssey/shared'
import { HStack, Text, VStack, useTheme } from '@odyssey/ui'

export type RevenueChartProps = {
  data: DashboardOverviewRevenueTrendItem[]
  height?: number
  currency?: string
}

const PADDING_TOP = 8
const PADDING_BOTTOM = 4

export function RevenueChart({ data, height = 180, currency = 'USD' }: RevenueChartProps) {
  const theme = useTheme()

  const { areaPath, linePath, peakCents, hasRevenue } = useMemo(() => {
    // Fixed viewBox width with preserveAspectRatio="none" lets the SVG stretch to any
    // container width without needing an onLayout measurement pass.
    const width = 100
    const usable = height - PADDING_TOP - PADDING_BOTTOM

    if (data.length === 0) {
      return { areaPath: '', linePath: '', peakCents: 0, hasRevenue: false }
    }

    const values = data.map((point) => point.revenueCents)
    const peak = Math.max(...values)

    // A single bucket has no horizontal span; treat the divisor as 1 to avoid 0/0.
    const stepX = data.length > 1 ? width / (data.length - 1) : width

    const toY = (value: number) => {
      // peak === 0 means every bucket is empty: pin to the baseline rather than NaN.
      if (peak === 0) return PADDING_TOP + usable
      return PADDING_TOP + usable - (value / peak) * usable
    }

    const points = values.map((value, index) => ({
      x: data.length > 1 ? index * stepX : width / 2,
      y: toY(value),
    }))

    const line = points
      .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(2)},${point.y.toFixed(2)}`)
      .join(' ')

    const first = points[0]
    const last = points[points.length - 1]
    const baseline = PADDING_TOP + usable

    const area =
      first && last
        ? `${line} L${last.x.toFixed(2)},${baseline} L${first.x.toFixed(2)},${baseline} Z`
        : ''

    return { areaPath: area, linePath: line, peakCents: peak, hasRevenue: peak > 0 }
  }, [data, height])

  return (
    <VStack gap={2}>
      <HStack justify="space-between" align="center">
        <Text variant="caption" tone="subtle">
          Peak {formatMoneyCompact(peakCents, { currency })}
        </Text>
        <Text variant="caption" tone="subtle">
          {data.length} {data.length === 1 ? 'bucket' : 'buckets'}
        </Text>
      </HStack>

      <View style={{ height }}>
        <Svg width="100%" height={height} viewBox={`0 0 100 ${height}`} preserveAspectRatio="none">
          <Defs>
            <LinearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={theme.color.primary} stopOpacity={0.26} />
              <Stop offset="1" stopColor={theme.color.primary} stopOpacity={0.02} />
            </LinearGradient>
          </Defs>

          {/* Baseline, so a flat all-zero series still reads as a chart rather than a void. */}
          <SvgLine
            x1="0"
            y1={height - PADDING_BOTTOM}
            x2="100"
            y2={height - PADDING_BOTTOM}
            stroke={theme.color.border}
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />

          {hasRevenue && areaPath ? <Path d={areaPath} fill="url(#revenueFill)" /> : null}

          {linePath ? (
            <Path
              d={linePath}
              fill="none"
              stroke={hasRevenue ? theme.color.primary : theme.color.borderStrong}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              // Without this the horizontal stretch would scale the stroke into a wedge.
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
        </Svg>
      </View>

      {!hasRevenue ? (
        <Text variant="caption" tone="subtle" align="center">
          No revenue recorded in this range yet.
        </Text>
      ) : null}
    </VStack>
  )
}
