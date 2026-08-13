/**
 * The application chrome: sidebar navigation, mobile bottom bar, and content area.
 *
 * Responsive behaviour is driven by `useBreakpoint()` rather than CSS, so the same rules
 * apply on web and native:
 *
 *   lg and up  full sidebar with labels
 *   md         icon-only rail, to give tables room on a tablet
 *   sm         sidebar hidden entirely, replaced by a bottom tab bar
 *
 * Navigation state comes from expo-router's `usePathname()`, so the active item is always
 * derived from the URL. Keeping it derived rather than stored means a deep link, a browser
 * back button and an in-app press all produce the same highlighted state with no syncing.
 */
import type { ReactNode } from 'react'
import { Platform, Pressable, ScrollView, View } from 'react-native'
import { usePathname, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import {
  HStack,
  NavItem,
  Text,
  VStack,
  useBreakpoint,
  useTheme,
  useThemeControls,
} from '@odyssey/ui'

import {
  CustomersIcon,
  HomeIcon,
  MenuIcon,
  MoonIcon,
  OrdersIcon,
  PaletteIcon,
  SettingsIcon,
  SunIcon,
} from './icons'

type NavEntry = {
  href: string
  label: string
  icon: (props: { size?: number; color?: string }) => ReactNode
  /** Extra path prefixes that should also mark this entry active (detail routes). */
  matches?: string[]
}

const NAV: NavEntry[] = [
  { href: '/', label: 'Home', icon: HomeIcon },
  { href: '/orders', label: 'Orders', icon: OrdersIcon, matches: ['/orders'] },
  { href: '/menu', label: 'Menu', icon: MenuIcon, matches: ['/menu'] },
  { href: '/crm', label: 'CRM', icon: CustomersIcon, matches: ['/crm'] },
  { href: '/settings', label: 'Settings', icon: SettingsIcon, matches: ['/settings'] },
]

const UI_LIBRARY: NavEntry = { href: '/ui', label: 'UI library', icon: PaletteIcon, matches: ['/ui'] }

/**
 * Active-route matching.
 *
 * Exact match for the index route, prefix match for everything else — otherwise
 * `/orders/abc-123` would not highlight the Orders entry, and `/` would match every route.
 */
function isActive(pathname: string, entry: NavEntry): boolean {
  if (entry.href === '/') return pathname === '/'
  return (entry.matches ?? [entry.href]).some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  const theme = useTheme()
  const breakpoint = useBreakpoint()
  const pathname = usePathname()
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const isCompact = breakpoint === 'sm'
  const isCollapsed = breakpoint === 'md'

  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: theme.color.background }}>
      {!isCompact ? (
        <Sidebar collapsed={isCollapsed} pathname={pathname} onNavigate={router.push} />
      ) : null}

      <View style={{ flex: 1 }}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            padding: theme.spacing[isCompact ? 4 : 8],
            paddingBottom: theme.spacing[16],
            // Centre the content column on very wide screens so line lengths stay readable.
            maxWidth: theme.layout.maxContentWidth,
            width: '100%',
            alignSelf: 'center',
          }}
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>

        {isCompact ? (
          <BottomBar pathname={pathname} onNavigate={router.push} bottomInset={insets.bottom} />
        ) : null}
      </View>
    </View>
  )
}

function Sidebar({
  collapsed,
  pathname,
  onNavigate,
}: {
  collapsed: boolean
  pathname: string
  onNavigate: (href: string) => void
}) {
  const theme = useTheme()
  const { mode, toggleMode } = useThemeControls()

  return (
    <View
      style={{
        width: collapsed ? theme.layout.sidebarCollapsedWidth : theme.layout.sidebarWidth,
        backgroundColor: theme.color.surface,
        borderRightWidth: theme.borderWidth.hairline,
        borderRightColor: theme.color.border,
        paddingVertical: theme.spacing[4],
        paddingHorizontal: theme.spacing[3],
      }}
    >
      {/* Brand */}
      <HStack
        gap={2.5}
        align="center"
        style={{
          paddingHorizontal: theme.spacing[2],
          paddingBottom: theme.spacing[6],
          justifyContent: collapsed ? 'center' : 'flex-start',
        }}
      >
        <View
          style={{
            width: 30,
            height: 30,
            borderRadius: theme.radius.lg,
            backgroundColor: theme.color.primary,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text variant="bodySm" weight="700" style={{ color: theme.color.textInverse }}>
            O
          </Text>
        </View>
        {!collapsed ? (
          <VStack gap={0}>
            <Text variant="bodyMedium" weight="600">
              Odyssey
            </Text>
            <Text variant="caption" tone="subtle">
              Restaurant ops
            </Text>
          </VStack>
        ) : null}
      </HStack>

      <VStack gap={0.5}>
        {NAV.map((entry) => (
          <NavItem
            key={entry.href}
            label={entry.label}
            collapsed={collapsed}
            active={isActive(pathname, entry)}
            onPress={() => onNavigate(entry.href)}
            icon={
              <entry.icon
                size={19}
                color={isActive(pathname, entry) ? theme.color.primaryText : theme.color.textMuted}
              />
            }
          />
        ))}
      </VStack>

      <View style={{ flex: 1 }} />

      <VStack gap={0.5}>
        <NavItem
          label={UI_LIBRARY.label}
          collapsed={collapsed}
          active={isActive(pathname, UI_LIBRARY)}
          onPress={() => onNavigate(UI_LIBRARY.href)}
          icon={
            <UI_LIBRARY.icon
              size={19}
              color={
                isActive(pathname, UI_LIBRARY) ? theme.color.primaryText : theme.color.textMuted
              }
            />
          }
        />
        <NavItem
          label={mode === 'dark' ? 'Light mode' : 'Dark mode'}
          collapsed={collapsed}
          active={false}
          onPress={toggleMode}
          icon={
            mode === 'dark' ? (
              <SunIcon size={19} color={theme.color.textMuted} />
            ) : (
              <MoonIcon size={19} color={theme.color.textMuted} />
            )
          }
        />
      </VStack>
    </View>
  )
}

/**
 * Mobile navigation.
 *
 * A bottom bar rather than a hamburger drawer: the five destinations are the whole
 * product, and one tap beats two. `insets.bottom` keeps it clear of the home indicator.
 */
function BottomBar({
  pathname,
  onNavigate,
  bottomInset,
}: {
  pathname: string
  onNavigate: (href: string) => void
  bottomInset: number
}) {
  const theme = useTheme()

  return (
    <HStack
      style={{
        borderTopWidth: theme.borderWidth.hairline,
        borderTopColor: theme.color.border,
        backgroundColor: theme.color.surface,
        paddingBottom: bottomInset,
        paddingTop: theme.spacing[1.5],
      }}
    >
      {NAV.map((entry) => {
        const active = isActive(pathname, entry)
        return (
          <Pressable
            key={entry.href}
            onPress={() => onNavigate(entry.href)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={entry.label}
            style={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              gap: theme.spacing[1],
              minHeight: theme.layout.minTouchTarget,
              paddingVertical: theme.spacing[1],
              ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
            }}
          >
            <entry.icon size={21} color={active ? theme.color.primary : theme.color.textSubtle} />
            <Text variant="caption" tone={active ? 'primary' : 'subtle'} weight={active ? '600' : '500'}>
              {entry.label}
            </Text>
          </Pressable>
        )
      })}
    </HStack>
  )
}
