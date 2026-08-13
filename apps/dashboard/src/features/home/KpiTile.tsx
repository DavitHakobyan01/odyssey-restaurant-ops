/**
 * A single KPI figure.
 *
 * Kept as its own component so the four tiles on Home are guaranteed to share a baseline,
 * an icon treatment and a loading skeleton. The skeleton deliberately matches the real
 * tile's dimensions — a spinner here would collapse the layout and make the whole row
 * jump when data lands.
 */
import type { ReactNode } from 'react'

import { Card, HStack, Skeleton, Text, VStack, useTheme } from '@odyssey/ui'
import type { Tone } from '@odyssey/ui'

export type KpiTileProps = {
  label: string
  /** Pre-formatted. Formatting is the caller's job so the tile stays presentational. */
  value: string
  /** Optional supporting line, e.g. "12 awaiting acceptance". */
  caption?: string
  icon?: ReactNode
  tone?: Tone
  testID?: string
}

export function KpiTile({ label, value, caption, icon, tone = 'neutral', testID }: KpiTileProps) {
  const theme = useTheme()

  const iconBackground =
    tone === 'neutral' ? theme.color.surfaceSunken : theme.color[`${tone}Subtle` as const]

  return (
    <Card padding={5} testID={testID} style={{ flex: 1, minWidth: 200 }}>
      <VStack gap={3}>
        <HStack gap={2.5} align="center" justify="space-between">
          <Text variant="bodySm" tone="muted" weight="500">
            {label}
          </Text>
          {icon ? (
            <VStack
              align="center"
              justify="center"
              style={{
                width: theme.spacing[8],
                height: theme.spacing[8],
                borderRadius: theme.radius.lg,
                backgroundColor: iconBackground,
              }}
            >
              {icon}
            </VStack>
          ) : null}
        </HStack>

        {/* Tabular numerals: without them a row of figures reads visibly ragged. */}
        <Text variant="display" numeric>
          {value}
        </Text>

        {caption ? (
          <Text variant="caption" tone="subtle">
            {caption}
          </Text>
        ) : null}
      </VStack>
    </Card>
  )
}

/** Same footprint as a real tile, so nothing reflows when the query resolves. */
export function KpiTileSkeleton() {
  return (
    <Card padding={5} style={{ flex: 1, minWidth: 200 }}>
      <VStack gap={3}>
        <HStack justify="space-between" align="center">
          <Skeleton width={92} height={14} />
          <Skeleton width={32} height={32} radius="lg" />
        </HStack>
        <Skeleton width={130} height={38} />
        <Skeleton width={76} height={12} />
      </VStack>
    </Card>
  )
}
