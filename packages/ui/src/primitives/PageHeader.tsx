/**
 * PageHeader — the top block every screen in the product starts with.
 *
 * This is the component that decides whether five separately-built dashboard pages look
 * like one product, so it is deliberately rigid: the title is always the `title` scale,
 * the description is always muted body text, the vertical rhythm between breadcrumbs,
 * title, description and the rule below is fixed, and there is no `size` or `align` prop
 * for a page to opt out with. Anything a screen genuinely needs to differ on goes in
 * `actions`, which is the one open slot.
 *
 * Two things worth knowing:
 *
 *  1. **Actions move below the title on a phone, they do not shrink.** Squeezing a row of
 *     buttons next to a 26px title on a 375px screen truncates the title, which is the one
 *     element that must always be readable. The switch is driven by `useBreakpoint()` and
 *     not by a media query, so native gets the same behaviour as web.
 *
 *  2. **The title is wrapped in a `header` role.** `Text` intentionally exposes no
 *     accessibility props (it is a pure typographic primitive), so the semantics live on a
 *     wrapper View. React Native has no heading-level concept; screen readers get "heading"
 *     without a level, which is still far better than an unlabelled string.
 */
import { View, type StyleProp, type ViewStyle } from 'react-native'
import type { ReactNode } from 'react'

import { useBreakpoint, useTheme } from '../theme/ThemeProvider'
import { Breadcrumbs, type BreadcrumbItem } from './Breadcrumbs'
import { Text } from './Text'

export type PageHeaderProps = {
  title: string
  /** One sentence explaining what the page is for or what the numbers cover. */
  description?: string
  /** Page-level controls — usually Buttons. Wraps below the title on small screens. */
  actions?: ReactNode
  /** Trail above the title. Root first, current page last. */
  breadcrumbs?: BreadcrumbItem[]
  style?: StyleProp<ViewStyle>
  testID?: string
}

export function PageHeader({
  title,
  description,
  actions,
  breadcrumbs,
  style,
  testID,
}: PageHeaderProps) {
  const theme = useTheme()
  const breakpoint = useBreakpoint()

  // Only the phone breakpoint stacks. A tablet has room for title and actions side by side.
  const stacked = breakpoint === 'sm'

  return (
    <View
      testID={testID}
      style={[
        {
          alignSelf: 'stretch',
          gap: theme.spacing[3],
          paddingBottom: theme.spacing[5],
        },
        style,
      ]}
    >
      {breadcrumbs && breadcrumbs.length > 0 ? <Breadcrumbs items={breadcrumbs} /> : null}

      <View
        style={{
          flexDirection: stacked ? 'column' : 'row',
          // Top-aligned rather than centred: with a description present, centring would
          // float the buttons into the middle of the text block.
          alignItems: stacked ? 'stretch' : 'flex-start',
          gap: theme.spacing[4],
        }}
      >
        <View style={{ ...(stacked ? {} : { flex: 1 }), gap: theme.spacing[1] }}>
          <View accessibilityRole="header">
            <Text variant="title">{title}</Text>
          </View>

          {description ? (
            <Text variant="body" tone="muted">
              {description}
            </Text>
          ) : null}
        </View>

        {actions ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              // Actions wrap among themselves too, so a page with four buttons degrades
              // into two rows instead of clipping the last one.
              flexWrap: 'wrap',
              gap: theme.spacing[2],
              justifyContent: stacked ? 'flex-start' : 'flex-end',
            }}
          >
            {actions}
          </View>
        ) : null}
      </View>
    </View>
  )
}
