/**
 * `@odyssey/ui` — the design system.
 *
 * The dashboard imports everything from this one entry point. Screens never reach into
 * `primitives/*` directly, so the set of components that exist is exactly the set exported
 * here — which is what keeps "is there already a component for this?" answerable by
 * reading one file.
 *
 * Layers:
 *   tokens/      design tokens (the only place visual values are declared)
 *   theme/       ThemeProvider + useTheme + responsive hooks
 *   primitives/  the components themselves
 *
 * Every component styles itself from semantic tokens via `useTheme()`, so dark mode works
 * without a single `mode === 'dark'` branch anywhere in the system.
 */

/* ------------------------------- Foundation ------------------------------- */

export {
  ThemeProvider,
  useTheme,
  useThemeControls,
  useBreakpoint,
  useMinBreakpoint,
} from './theme/ThemeProvider'
export { webCursor, isWeb } from './theme/platform'
export type { ThemePreference, ThemeProviderProps } from './theme/ThemeProvider'

export {
  palette,
  spacing,
  typography,
  fontFamily,
  radius,
  borderWidth,
  elevation,
  layout,
  zIndex,
  motion,
  lightColors,
  darkColors,
  lightTheme,
  darkTheme,
  themes,
  toneColors,
  TONES,
} from './tokens'
export type {
  Theme,
  ThemeMode,
  ThemeColors,
  Tone,
  Spacing,
  Radius,
  Elevation,
  Breakpoint,
  TypographyVariant,
  Palette,
} from './tokens'

/* --------------------------------- Layout --------------------------------- */

export { Stack, HStack, VStack, Spacer, Divider } from './primitives/Stack'
export type { StackProps } from './primitives/Stack'

export { Text, MonoText } from './primitives/Text'
export type { TextProps, TextTone } from './primitives/Text'

/* --------------------------------- Actions -------------------------------- */

export { Button, IconButton } from './primitives/Button'
export type { ButtonProps, ButtonVariant, ButtonSize } from './primitives/Button'

/* ------------------------------ Form controls ----------------------------- */

export { Field, FieldGroup, useField } from './primitives/Field'
export type { FieldProps, FieldGroupProps } from './primitives/Field'

export { Input, MoneyInput, formatCentsForInput, parseCentsFromInput } from './primitives/Input'
export type { InputProps, InputSize, MoneyInputProps } from './primitives/Input'

export { Textarea } from './primitives/Textarea'
export type { TextareaProps } from './primitives/Textarea'

export { Switch } from './primitives/Switch'
export type { SwitchProps, SwitchSize } from './primitives/Switch'

export { Checkbox } from './primitives/Checkbox'
export type { CheckboxProps, CheckboxSize } from './primitives/Checkbox'

export { Select, MultiSelect } from './primitives/Select'
export type { SelectProps, MultiSelectProps, SelectOption, SelectSize } from './primitives/Select'

export { Menu } from './primitives/Menu'
export type { MenuProps, MenuItem } from './primitives/Menu'

export { Popover } from './primitives/Popover'
export type { PopoverProps, PopoverSide, PopoverAlign } from './primitives/Popover'

/* -------------------------------- Overlays -------------------------------- */

export { Modal, DialogHeader, DialogBody, DialogFooter } from './primitives/Modal'
export type { ModalProps, ModalSize } from './primitives/Modal'

export { Drawer } from './primitives/Drawer'
export type { DrawerProps, DrawerSize } from './primitives/Drawer'

/* ------------------------------ Data display ------------------------------ */

export { Card, CardHeader, CardBody, CardFooter } from './primitives/Card'
export type {
  CardProps,
  CardHeaderProps,
  CardBodyProps,
  CardFooterProps,
} from './primitives/Card'

export { Badge, StatusDot } from './primitives/Badge'
export type { BadgeProps, BadgeVariant, BadgeSize, StatusDotProps } from './primitives/Badge'

export { Table } from './primitives/Table'
export type { TableProps, TableColumn, TableAlign } from './primitives/Table'

export { Avatar, initialsFromName } from './primitives/Avatar'
export type { AvatarProps, AvatarSize } from './primitives/Avatar'

/* -------------------------------- Feedback -------------------------------- */

export { Skeleton, SkeletonText, SkeletonCard } from './primitives/Skeleton'
export type { SkeletonProps, SkeletonTextProps, SkeletonCardProps } from './primitives/Skeleton'

export { Spinner } from './primitives/Spinner'
export type { SpinnerProps, SpinnerSize, SpinnerTone } from './primitives/Spinner'

export { ToastProvider, useToast, Toast } from './primitives/Toast'
export type { ToastOptions, ToastProps, ToastProviderProps } from './primitives/Toast'

export { Alert } from './primitives/Alert'
export type { AlertProps } from './primitives/Alert'

export { EmptyState } from './primitives/EmptyState'
export type { EmptyStateProps, EmptyStateSize } from './primitives/EmptyState'

export { ErrorState } from './primitives/ErrorState'
export type { ErrorStateProps, ErrorStateSize } from './primitives/ErrorState'

/* ------------------------------- Navigation ------------------------------- */

export { NavItem } from './primitives/NavItem'
export type { NavItemProps } from './primitives/NavItem'

export { Tabs } from './primitives/Tabs'
export type { TabsProps, TabItem } from './primitives/Tabs'

export { Breadcrumbs } from './primitives/Breadcrumbs'
export type { BreadcrumbsProps, BreadcrumbItem } from './primitives/Breadcrumbs'

export { PageHeader } from './primitives/PageHeader'
export type { PageHeaderProps } from './primitives/PageHeader'
