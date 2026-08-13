/**
 * Icon set.
 *
 * Hand-drawn SVG paths rather than an icon library, for two reasons: it keeps
 * `@odyssey/ui` dependency-free (the design system takes icons as `ReactNode`, so it
 * never needs to know what draws them), and it avoids shipping an entire icon font for
 * the dozen glyphs this product actually uses.
 *
 * Every icon takes `size` and `color` and defaults to `currentColor`-style inheritance
 * via an explicit prop, because React Native has no `currentColor`.
 */
import Svg, { Circle, Path, Rect } from 'react-native-svg'

export type IconProps = {
  size?: number
  color?: string
  strokeWidth?: number
}

/** Shared stroke defaults — a consistent optical weight across the set. */
function useIconProps({ size = 20, color = '#000', strokeWidth = 1.75 }: IconProps) {
  return {
    size,
    stroke: color,
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  }
}

export function HomeIcon(props: IconProps) {
  const p = useIconProps(props)
  return (
    <Svg width={p.size} height={p.size} viewBox="0 0 24 24">
      <Path d="M3 10.5 12 3l9 7.5" {...p} />
      <Path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" {...p} />
    </Svg>
  )
}

export function OrdersIcon(props: IconProps) {
  const p = useIconProps(props)
  return (
    <Svg width={p.size} height={p.size} viewBox="0 0 24 24">
      <Path d="M6 3h12a1 1 0 0 1 1 1v16l-3-2-2 2-2-2-2 2-2-2-3 2V4a1 1 0 0 1 1-1Z" {...p} />
      <Path d="M9 8h6M9 12h6" {...p} />
    </Svg>
  )
}

export function MenuIcon(props: IconProps) {
  const p = useIconProps(props)
  return (
    <Svg width={p.size} height={p.size} viewBox="0 0 24 24">
      <Path d="M7 3v8a3 3 0 0 0 3 3v7M7 3v5M10 3v5" {...p} />
      <Path d="M17 3c-1.5 2-2 4-2 6s.7 3 2 3v9" {...p} />
    </Svg>
  )
}

export function CustomersIcon(props: IconProps) {
  const p = useIconProps(props)
  return (
    <Svg width={p.size} height={p.size} viewBox="0 0 24 24">
      <Circle cx="9" cy="8" r="3.25" {...p} />
      <Path d="M3.5 20a5.5 5.5 0 0 1 11 0" {...p} />
      <Path d="M16 5.5a3.25 3.25 0 0 1 0 6M17.5 20a5.5 5.5 0 0 0-2-4.2" {...p} />
    </Svg>
  )
}

export function SettingsIcon(props: IconProps) {
  const p = useIconProps(props)
  return (
    <Svg width={p.size} height={p.size} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="3" {...p} />
      <Path
        d="M12 2.5v2.2M12 19.3v2.2M21.5 12h-2.2M4.7 12H2.5M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6M18.7 18.7l-1.6-1.6M6.9 6.9 5.3 5.3"
        {...p}
      />
    </Svg>
  )
}

export function PaletteIcon(props: IconProps) {
  const p = useIconProps(props)
  return (
    <Svg width={p.size} height={p.size} viewBox="0 0 24 24">
      <Path
        d="M12 3a9 9 0 1 0 0 18c1.1 0 1.8-.9 1.8-1.8 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-1 .8-1.8 1.8-1.8H16a5 5 0 0 0 5-5c0-3.9-4-7-9-7Z"
        {...p}
      />
      <Circle cx="7.5" cy="11.5" r="1.1" fill={p.stroke} stroke="none" />
      <Circle cx="10.5" cy="7.5" r="1.1" fill={p.stroke} stroke="none" />
      <Circle cx="15.5" cy="8.5" r="1.1" fill={p.stroke} stroke="none" />
    </Svg>
  )
}

export function PlusIcon(props: IconProps) {
  const p = useIconProps(props)
  return (
    <Svg width={p.size} height={p.size} viewBox="0 0 24 24">
      <Path d="M12 5v14M5 12h14" {...p} />
    </Svg>
  )
}

export function SearchIcon(props: IconProps) {
  const p = useIconProps(props)
  return (
    <Svg width={p.size} height={p.size} viewBox="0 0 24 24">
      <Circle cx="11" cy="11" r="6.5" {...p} />
      <Path d="m16 16 4.5 4.5" {...p} />
    </Svg>
  )
}

export function ChevronRightIcon(props: IconProps) {
  const p = useIconProps(props)
  return (
    <Svg width={p.size} height={p.size} viewBox="0 0 24 24">
      <Path d="m9 5 7 7-7 7" {...p} />
    </Svg>
  )
}

export function ChevronDownIcon(props: IconProps) {
  const p = useIconProps(props)
  return (
    <Svg width={p.size} height={p.size} viewBox="0 0 24 24">
      <Path d="m5 9 7 7 7-7" {...p} />
    </Svg>
  )
}

export function CloseIcon(props: IconProps) {
  const p = useIconProps(props)
  return (
    <Svg width={p.size} height={p.size} viewBox="0 0 24 24">
      <Path d="M6 6l12 12M18 6 6 18" {...p} />
    </Svg>
  )
}

export function CheckIcon(props: IconProps) {
  const p = useIconProps(props)
  return (
    <Svg width={p.size} height={p.size} viewBox="0 0 24 24">
      <Path d="m5 12.5 4.5 4.5L19 7" {...p} />
    </Svg>
  )
}

export function TrendUpIcon(props: IconProps) {
  const p = useIconProps(props)
  return (
    <Svg width={p.size} height={p.size} viewBox="0 0 24 24">
      <Path d="m3 16 5.5-5.5 4 4L21 6" {...p} />
      <Path d="M15 6h6v6" {...p} />
    </Svg>
  )
}

export function ClockIcon(props: IconProps) {
  const p = useIconProps(props)
  return (
    <Svg width={p.size} height={p.size} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="9" {...p} />
      <Path d="M12 7v5.2l3.2 2" {...p} />
    </Svg>
  )
}

export function RevenueIcon(props: IconProps) {
  const p = useIconProps(props)
  return (
    <Svg width={p.size} height={p.size} viewBox="0 0 24 24">
      <Path d="M12 3v18" {...p} />
      <Path d="M16.5 7.5c0-1.7-2-2.8-4.5-2.8S7.5 5.8 7.5 7.5s2 2.4 4.5 2.9 4.5 1.2 4.5 3-2 3-4.5 3-4.5-1.1-4.5-2.8" {...p} />
    </Svg>
  )
}

export function MoonIcon(props: IconProps) {
  const p = useIconProps(props)
  return (
    <Svg width={p.size} height={p.size} viewBox="0 0 24 24">
      <Path d="M20 14.2A8.2 8.2 0 0 1 9.8 4a8.2 8.2 0 1 0 10.2 10.2Z" {...p} />
    </Svg>
  )
}

export function SunIcon(props: IconProps) {
  const p = useIconProps(props)
  return (
    <Svg width={p.size} height={p.size} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="4" {...p} />
      <Path d="M12 2.5v1.8M12 19.7v1.8M21.5 12h-1.8M4.3 12H2.5M18.4 5.6l-1.3 1.3M6.9 17.1l-1.3 1.3M18.4 18.4l-1.3-1.3M6.9 6.9 5.6 5.6" {...p} />
    </Svg>
  )
}

export function InboxIcon(props: IconProps) {
  const p = useIconProps(props)
  return (
    <Svg width={p.size} height={p.size} viewBox="0 0 24 24">
      <Rect x="3" y="4" width="18" height="16" rx="2" {...p} />
      <Path d="M3 14h4l1.5 2.5h7L17 14h4" {...p} />
    </Svg>
  )
}

export function AlertIcon(props: IconProps) {
  const p = useIconProps(props)
  return (
    <Svg width={p.size} height={p.size} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="9" {...p} />
      <Path d="M12 7.5v5.5" {...p} />
      <Circle cx="12" cy="16.3" r="0.9" fill={p.stroke} stroke="none" />
    </Svg>
  )
}
