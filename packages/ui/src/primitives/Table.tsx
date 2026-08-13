/**
 * Table — the data surface the whole dashboard is built on (orders, reservations, staff,
 * inventory). It is generic over the row type, so a column's `render` receives a fully
 * typed row and a typo in a field name is a compile error rather than a blank cell.
 *
 * The decisions that matter here, and why:
 *
 *  1. **Loading renders skeleton rows, never a spinner.** A spinner throws away the
 *     layout: the container collapses to spinner height, the page reflows, and reflows
 *     again when data lands — so the operator's cursor is over a different row than the
 *     one they aimed at. Skeleton rows occupy the exact column geometry the real rows
 *     will, so the only thing that changes on arrival is the pixels inside the cells. The
 *     header stays mounted while loading for the same reason.
 *
 *  2. **On `sm` the table stops being a table.** A horizontally scrolling grid on a phone
 *     is unusable — you cannot see the row label and the value you are reading at the same
 *     time. At `sm` each row becomes a Card of label/value pairs instead. This is a real
 *     structural swap, not a CSS tweak, which is exactly why it is driven by
 *     `useBreakpoint()` rather than by media queries that native does not have.
 *
 *  3. **`stickyHeader` moves the header out of the list rather than using
 *     `stickyHeaderIndices`.** When sticky, the header renders as a sibling above the
 *     FlatList so it simply never scrolls; when not sticky it is the `ListHeaderComponent`
 *     and scrolls away with the rows. Two plain compositions behave identically on web and
 *     native, whereas sticky-index support differs per platform.
 *
 *  4. **FlatList, not `.map()`.** A busy service produces order lists in the thousands;
 *     virtualisation is the difference between a scroll that tracks the finger and one
 *     that does not. It also gives empty-state and separator handling for free.
 *
 *  5. **Sort indicators reserve their space.** The arrow slot is always laid out and only
 *     its opacity changes, so sorting a column cannot change the header's width and shove
 *     every other column sideways — the same trick Button uses to keep its width while
 *     loading.
 */
import { useState } from 'react'
import {
  FlatList,
  Pressable,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import type { ReactNode } from 'react'

import { webCursor } from '../theme/platform'
import { useBreakpoint, useTheme } from '../theme/ThemeProvider'
import type { Theme } from '../tokens'
import { Card } from './Card'
import { Divider } from './Stack'
import { Skeleton } from './Skeleton'
import { Text } from './Text'

export type TableAlign = 'left' | 'center' | 'right'
export type SortDirection = 'asc' | 'desc'

export type TableColumn<T> = {
  /** Stable identity for the column. Also the value passed to `onSortChange`. */
  key: string
  /** Header content. A string is wrapped in the type scale automatically. */
  header: ReactNode
  /**
   * Plain-text header, needed when `header` is a node. Used for the sortable header's
   * accessible name and as the label in the mobile stacked layout, neither of which can
   * read text out of an arbitrary React element.
   */
  headerLabel?: string
  /** Fixed width in px. Columns without one share the remaining space equally. */
  width?: number
  /** `right` for money and counts — ragged right edges make figures hard to compare. */
  align?: TableAlign
  render: (row: T) => ReactNode
  sortable?: boolean
  /** Drop this column from the mobile stack. For columns that only make sense in a grid. */
  hideOnMobile?: boolean
}

export type TableProps<T> = {
  data: T[]
  columns: Array<TableColumn<T>>
  keyExtractor: (row: T, index: number) => string
  onRowPress?: (row: T) => void
  /** The `key` of the sorted column. Sorting itself is the caller's job — see below. */
  sortBy?: string
  sortDir?: SortDirection
  /**
   * Called with the column key and the direction to move to. The table is a controlled,
   * presentational component: it never sorts `data` itself, because in practice sorting
   * happens on the server for anything longer than a screen and a table that quietly
   * re-orders a page of server-sorted results is worse than one that does nothing.
   */
  onSortChange?: (key: string, direction: SortDirection) => void
  loading?: boolean
  /** How many skeleton rows to show. Aim for roughly a screenful to avoid a jump. */
  loadingRowCount?: number
  /** Shown when `data` is empty and not loading. Falls back to a plain message. */
  emptyState?: ReactNode
  stickyHeader?: boolean
  /** Full control over a row's mobile appearance. Falls back to a label/value stack. */
  renderMobileRow?: (row: T) => ReactNode
  /** Overrides the default `↑` / `↓` glyphs — no icon library is assumed. */
  sortAscIndicator?: ReactNode
  sortDescIndicator?: ReactNode
  /** Names the table for screen readers, e.g. "Orders". */
  accessibilityLabel?: string
  style?: StyleProp<ViewStyle>
  testID?: string
}

/* -------------------------------------------------------------------------- */
/*                                   Layout                                    */
/* -------------------------------------------------------------------------- */

/** Row geometry, in spacing-scale keys. Header and body share it so cells line up. */
const ROW_PADDING_H = 4
const ROW_PADDING_V = 3
const CELL_GAP = 3

/** Width of the sort-arrow slot, in spacing-scale keys. Always reserved — see (5) above. */
const SORT_SLOT = 3

/**
 * Skeleton bar widths, cycled by column index.
 *
 * Uniform bars read as a barcode rather than as text; varying them makes a loading table
 * look like the table it is about to become.
 */
const SKELETON_WIDTHS = ['64%', '44%', '78%', '38%', '56%'] as const

const ALIGN_TO_FLEX = {
  left: 'flex-start',
  center: 'center',
  right: 'flex-end',
} as const

function cellStyle(theme: Theme, column: { width?: number; align?: TableAlign }): ViewStyle {
  return {
    ...(column.width !== undefined ? { width: column.width } : { flex: 1 }),
    alignItems: ALIGN_TO_FLEX[column.align ?? 'left'],
    // Without this a long unbreakable cell value (an email, a URL) forces the whole row
    // wider than the container and reintroduces the horizontal scroll we are avoiding.
    minWidth: 0,
    overflow: 'hidden',
  }
}

/**
 * Wrap bare strings and numbers returned by `render` in the type scale.
 *
 * Two reasons: React Native throws on a raw string outside a `<Text>`, so this turns a
 * common call-site slip into working code; and it means the default cell typography comes
 * from the scale rather than from whatever the caller happened to pick.
 */
function renderCellContent(value: ReactNode, align: TableAlign): ReactNode {
  if (typeof value === 'string' || typeof value === 'number') {
    return (
      <Text variant="bodySm" numberOfLines={1} align={align} numeric={align === 'right'}>
        {value}
      </Text>
    )
  }
  return value
}

function headerText(column: { header: ReactNode; headerLabel?: string }): string | undefined {
  if (typeof column.header === 'string') return column.header
  return column.headerLabel
}

/* -------------------------------------------------------------------------- */
/*                                Header cells                                 */
/* -------------------------------------------------------------------------- */

type SortableHeaderCellProps = {
  label: ReactNode
  align: TableAlign
  width?: number
  active: boolean
  direction: SortDirection
  ascIndicator: ReactNode
  descIndicator: ReactNode
  accessibilityLabel?: string
  onPress: () => void
}

/**
 * A pressable column header.
 *
 * Its own component because each header owns hover and focus state, and hooks cannot be
 * called inside the `columns.map()` that produces them.
 *
 * The focus ring is drawn *inset* here rather than outside the box as in Button: the table
 * container clips to its rounded corners, so an outset ring on the first or last column
 * would be sliced in half. Inset is still absolutely positioned, so it still cannot shift
 * layout — the invariant that matters is preserved, only the offset changes.
 */
function SortableHeaderCell({
  label,
  align,
  width,
  active,
  direction,
  ascIndicator,
  descIndicator,
  accessibilityLabel,
  onPress,
}: SortableHeaderCellProps) {
  const theme = useTheme()
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)

  const indicator = active && direction === 'desc' ? descIndicator : ascIndicator

  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: active }}
      style={({ pressed }) => ({
        ...cellStyle(theme, { width, align }),
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: ALIGN_TO_FLEX[align],
        gap: theme.spacing[1],
        // Vertical padding only: any horizontal padding here would inset the header label
        // relative to the body cells below it and visibly break the column's left edge.
        paddingVertical: theme.spacing[1],
        borderRadius: theme.radius.md,
        backgroundColor: pressed
          ? theme.color.surfaceActive
          : hovered
            ? theme.color.surfaceHover
            : 'transparent',
        ...webCursor('pointer'),
      })}
    >
      {typeof label === 'string' ? (
        <Text
          variant="caption"
          weight="600"
          numberOfLines={1}
          tone={active ? 'primary' : 'muted'}
        >
          {label}
        </Text>
      ) : (
        label
      )}

      {/* Always laid out; only opacity changes, so sorting never re-widths the header. */}
      <View
        style={{
          width: theme.spacing[SORT_SLOT],
          alignItems: 'center',
          opacity: active ? 1 : hovered ? 0.5 : 0,
        }}
      >
        {typeof indicator === 'string' ? (
          <Text variant="caption" tone={active ? 'primary' : 'muted'}>
            {indicator}
          </Text>
        ) : (
          indicator
        )}
      </View>

      {focused ? (
        <View
          style={{
            pointerEvents: 'none',
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            borderRadius: theme.radius.md,
            borderWidth: theme.borderWidth.focus,
            borderColor: theme.color.borderFocus,
          }}
        />
      ) : null}
    </Pressable>
  )
}

/* -------------------------------------------------------------------------- */
/*                                    Rows                                     */
/* -------------------------------------------------------------------------- */

type TableRowProps = {
  children: ReactNode
  onPress?: () => void
  accessibilityLabel?: string
  testID?: string
}

/**
 * One grid row. Separate component for the same reason as the header cell: per-row hover
 * and focus state needs its own hooks.
 *
 * A non-pressable row is a plain View with no hover treatment at all — highlighting a row
 * the operator cannot click is a false affordance.
 */
function TableRow({ children, onPress, accessibilityLabel, testID }: TableRowProps) {
  const theme = useTheme()
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)

  const base: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[CELL_GAP],
    paddingHorizontal: theme.spacing[ROW_PADDING_H],
    paddingVertical: theme.spacing[ROW_PADDING_V],
    minHeight: theme.layout.minTouchTarget,
  }

  if (onPress === undefined) {
    return (
      <View testID={testID} style={base}>
        {children}
      </View>
    )
  }

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => ({
        ...base,
        backgroundColor: pressed
          ? theme.color.surfaceActive
          : hovered
            ? theme.color.surfaceHover
            : 'transparent',
        ...webCursor('pointer'),
      })}
    >
      {children}
      {focused ? (
        <View
          style={{
            pointerEvents: 'none',
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            borderWidth: theme.borderWidth.focus,
            borderColor: theme.color.borderFocus,
          }}
        />
      ) : null}
    </Pressable>
  )
}

/**
 * A single skeleton bar, sized from the spacing scale so it matches a line of body text.
 *
 * Width is a percentage of the cell rather than a fixed number, so the bars keep tracking
 * the real column widths as the window resizes.
 */
function SkeletonBar({ width }: { width: `${number}%` }) {
  const theme = useTheme()
  // Delegates to the Skeleton primitive rather than drawing a static bar. A local
  // implementation looked identical at rest but never animated, so a loading Table and a
  // loading SkeletonCard on the same screen pulsed out of step — one of them not at all.
  return <Skeleton width={width} height={theme.spacing[3]} radius="sm" />
}

/* -------------------------------------------------------------------------- */
/*                                    Table                                    */
/* -------------------------------------------------------------------------- */

export function Table<T>({
  data,
  columns,
  keyExtractor,
  onRowPress,
  sortBy,
  sortDir = 'asc',
  onSortChange,
  loading = false,
  loadingRowCount = 6,
  emptyState,
  stickyHeader = false,
  renderMobileRow,
  sortAscIndicator = '↑',
  sortDescIndicator = '↓',
  accessibilityLabel,
  style,
  testID,
}: TableProps<T>) {
  const theme = useTheme()
  const isMobile = useBreakpoint() === 'sm'

  /**
   * Toggles direction on the active column and starts ascending on a new one. Ascending
   * first even for numeric columns: a consistent rule is easier to predict than a
   * per-column-type guess, and the second press is one click away.
   */
  const handleSort = (key: string) => {
    if (onSortChange === undefined) return
    onSortChange(key, sortBy === key && sortDir === 'asc' ? 'desc' : 'asc')
  }

  const empty = (
    <View style={{ padding: theme.spacing[8], alignItems: 'center', justifyContent: 'center' }}>
      {emptyState ?? (
        <Text variant="bodySm" tone="muted">
          Nothing to show yet.
        </Text>
      )}
    </View>
  )

  /* ------------------------------ Mobile stack ----------------------------- */

  if (isMobile) {
    const mobileColumns = columns.filter((column) => column.hideOnMobile !== true)

    const renderFallbackRow = (row: T) => (
      <View style={{ gap: theme.spacing[2] }}>
        {mobileColumns.map((column) => {
          const label = headerText(column)
          return (
            <View
              key={column.key}
              style={{
                flexDirection: 'row',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: theme.spacing[3],
              }}
            >
              {label !== undefined ? (
                <Text variant="caption" tone="subtle" numberOfLines={1}>
                  {label}
                </Text>
              ) : null}
              {/*
                Values sit on the trailing edge whatever the column's grid alignment was —
                a consistent right rail is what makes a stack of cards scannable. The
                column's own alignment still decides the *text* treatment, so a name does
                not silently acquire tabular numerals just because it moved right.
              */}
              <View style={{ flexShrink: 1, alignItems: 'flex-end' }}>
                {renderCellContent(column.render(row), column.align ?? 'left')}
              </View>
            </View>
          )
        })}
      </View>
    )

    if (loading) {
      return (
        <View testID={testID} style={[{ gap: theme.spacing[3] }, style]}>
          {Array.from({ length: loadingRowCount }, (_unused, rowIndex) => (
            <Card key={`skeleton-${rowIndex}`} elevation="sm">
              <View style={{ gap: theme.spacing[2] }}>
                {mobileColumns.map((column, columnIndex) => (
                  <View
                    key={column.key}
                    style={{ flexDirection: 'row', justifyContent: 'space-between' }}
                  >
                    <SkeletonBar width="30%" />
                    <SkeletonBar
                      width={SKELETON_WIDTHS[columnIndex % SKELETON_WIDTHS.length] ?? '50%'}
                    />
                  </View>
                ))}
              </View>
            </Card>
          ))}
        </View>
      )
    }

    return (
      <FlatList<T>
        testID={testID}
        accessibilityLabel={accessibilityLabel}
        style={style}
        data={data}
        keyExtractor={keyExtractor}
        ItemSeparatorComponent={<View style={{ height: theme.spacing[3] }} />}
        ListEmptyComponent={empty}
        renderItem={({ item }) => (
          <Card
            elevation="sm"
            interactive={onRowPress !== undefined}
            onPress={onRowPress !== undefined ? () => onRowPress(item) : undefined}
          >
            {renderMobileRow !== undefined ? renderMobileRow(item) : renderFallbackRow(item)}
          </Card>
        )}
      />
    )
  }

  /* ------------------------------ Grid layout ------------------------------ */

  const header = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing[CELL_GAP],
        paddingHorizontal: theme.spacing[ROW_PADDING_H],
        paddingVertical: theme.spacing[2],
        minHeight: theme.layout.minTouchTarget,
        backgroundColor: theme.color.surfaceSunken,
        borderBottomWidth: theme.borderWidth.hairline,
        borderBottomColor: theme.color.border,
      }}
    >
      {columns.map((column) => {
        const align = column.align ?? 'left'
        const label = headerText(column)
        const active = sortBy === column.key

        if (column.sortable === true && onSortChange !== undefined) {
          const state = active
            ? `, sorted ${sortDir === 'asc' ? 'ascending' : 'descending'}`
            : ', not sorted'

          return (
            <SortableHeaderCell
              key={column.key}
              label={label ?? column.header}
              align={align}
              width={column.width}
              active={active}
              direction={sortDir}
              ascIndicator={sortAscIndicator}
              descIndicator={sortDescIndicator}
              accessibilityLabel={label !== undefined ? `${label}${state}` : undefined}
              onPress={() => handleSort(column.key)}
            />
          )
        }

        return (
          <View key={column.key} style={cellStyle(theme, column)}>
            {typeof column.header === 'string' ? (
              <Text variant="caption" weight="600" tone="muted" numberOfLines={1} align={align}>
                {column.header}
              </Text>
            ) : (
              column.header
            )}
          </View>
        )
      })}
    </View>
  )

  const body = loading ? (
    <View>
      {Array.from({ length: loadingRowCount }, (_unused, rowIndex) => (
        <View key={`skeleton-${rowIndex}`}>
          {rowIndex > 0 ? <Divider /> : null}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing[CELL_GAP],
              paddingHorizontal: theme.spacing[ROW_PADDING_H],
              paddingVertical: theme.spacing[ROW_PADDING_V],
              minHeight: theme.layout.minTouchTarget,
            }}
          >
            {columns.map((column, columnIndex) => (
              <View key={column.key} style={cellStyle(theme, column)}>
                <SkeletonBar
                  width={
                    // Offset by the row so consecutive rows do not form vertical stripes.
                    SKELETON_WIDTHS[(columnIndex + rowIndex) % SKELETON_WIDTHS.length] ?? '50%'
                  }
                />
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  ) : (
    <FlatList<T>
      data={data}
      keyExtractor={keyExtractor}
      ItemSeparatorComponent={<Divider />}
      ListEmptyComponent={empty}
      // Not sticky: the header scrolls away with the rows. Sticky (or loading): it is
      // rendered outside the list instead, which behaves the same on web and native. Both
      // positions put it at the same place on screen, so the swap when data arrives is
      // invisible.
      ListHeaderComponent={stickyHeader ? undefined : header}
      renderItem={({ item, index }) => (
        <TableRow
          onPress={onRowPress !== undefined ? () => onRowPress(item) : undefined}
          testID={testID !== undefined ? `${testID}-row-${keyExtractor(item, index)}` : undefined}
        >
          {columns.map((column) => {
            const align = column.align ?? 'left'
            return (
              <View key={column.key} style={cellStyle(theme, column)}>
                {renderCellContent(column.render(item), align)}
              </View>
            )
          })}
        </TableRow>
      )}
    />
  )

  return (
    <Card padding={0} elevation="sm" style={style} testID={testID} accessibilityLabel={accessibilityLabel}>
      {stickyHeader || loading ? header : null}
      {body}
    </Card>
  )
}
