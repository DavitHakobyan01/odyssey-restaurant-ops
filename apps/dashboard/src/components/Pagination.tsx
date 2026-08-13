/**
 * Offset pagination controls for a server-paginated list.
 *
 * Extracted because Orders and CRM carried byte-identical copies of this block — and the
 * copies had already drifted: Orders received a responsive `justify` fix that CRM never
 * did, so the same control centred on a phone in one screen and hugged the right edge in
 * the other. That is the whole argument for pulling it out; two implementations of one
 * behaviour diverge the moment either is touched.
 *
 * Deliberately dumb: it owns no state and does no arithmetic beyond the range label. The
 * offset lives in the screen, because the screen is what feeds it to the query.
 */
import { Button, HStack, Text, useBreakpoint } from '@odyssey/ui'

export type PaginationProps = {
  /** Zero-based index of the first row on the current page. */
  offset: number
  pageSize: number
  /** Total matching rows on the server, not the length of the current page. */
  total: number
  hasMore: boolean
  /** True while a page is in flight — both buttons disable to prevent double-stepping. */
  busy?: boolean
  onOffsetChange: (offset: number) => void
  testID?: string
}

export function Pagination({
  offset,
  pageSize,
  total,
  hasMore,
  busy = false,
  onOffsetChange,
  testID,
}: PaginationProps) {
  const breakpoint = useBreakpoint()

  // Nothing to page through: rendering disabled controls would only add noise.
  if (total <= pageSize) return null

  const firstRow = offset + 1
  const lastRow = Math.min(offset + pageSize, total)

  return (
    <HStack
      gap={3}
      align="center"
      justify={breakpoint === 'sm' ? 'center' : 'flex-end'}
      wrap
      testID={testID}
    >
      <Text variant="bodySm" tone="muted" numeric>
        {`${firstRow}–${lastRow} of ${total}`}
      </Text>
      <Button
        variant="secondary"
        // `md` (44pt) rather than `sm`: on a phone this is a primary control and must
        // clear the minimum touch target.
        size={breakpoint === 'sm' ? 'md' : 'sm'}
        disabled={offset === 0 || busy}
        onPress={() => onOffsetChange(Math.max(0, offset - pageSize))}
        accessibilityLabel="Previous page"
      >
        Previous
      </Button>
      <Button
        variant="secondary"
        size={breakpoint === 'sm' ? 'md' : 'sm'}
        disabled={!hasMore || busy}
        onPress={() => onOffsetChange(offset + pageSize)}
        accessibilityLabel="Next page"
      >
        Next
      </Button>
    </HStack>
  )
}
