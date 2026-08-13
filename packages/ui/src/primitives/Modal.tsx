/**
 * Modal — the centred dialog, and on phones a bottom sheet.
 *
 * Decisions worth knowing before you change this file:
 *
 *  1. **It is built on React Native's `Modal`, not an absolutely-positioned `View`.**
 *     A view inside the app tree is clipped by any ancestor with `overflow: hidden` and
 *     is re-parented by any ancestor `transform` — both extremely common in a dashboard
 *     shell. RN's `Modal` renders in a real overlay layer (a new window on native, a
 *     portal at the end of the document on web), which also gives us the platform's own
 *     focus containment on web for free. `position: fixed` is not an option here: it does
 *     not exist on native.
 *
 *  2. **The backdrop and the panel are siblings, never parent and child.** That is what
 *     makes "pressing the panel must not close the dialog" true *structurally* rather
 *     than by intercepting an event: a press on the panel simply never reaches the
 *     backdrop's responder. The usual alternative — wrapping the panel in a second
 *     `Pressable` that swallows the press — puts a phantom button into the accessibility
 *     tree and makes the whole dialog announce itself as tappable.
 *
 *  3. **Escape and Android back are handled by `onRequestClose`.** React Native Web maps
 *     the Escape key onto it and Android maps the hardware back button onto it, so the
 *     keyboard affordance costs us no `document` listener and no web-only code path.
 *
 *  4. **Header and footer live outside the scroll view.** A long form must never scroll
 *     its own submit button off the screen, and the title has to stay visible as context
 *     while the body scrolls. Only the body scrolls; the panel itself never does.
 *
 *  5. **On `sm` the dialog becomes a bottom sheet** — full width, anchored to the bottom
 *     edge, top corners rounded only. A centred card with gutters on a phone wastes the
 *     screen and puts the actions out of thumb reach. This is a different component
 *     shape, not a narrower one, and it is the reason the modal feels designed on mobile
 *     rather than merely shrunk.
 *
 *  6. **Interactive parts are delegated to `Button` / `IconButton`,** which already
 *     implement all five states including the layout-stable focus ring. Re-implementing
 *     a close button here would be a second, drifting copy of that state matrix.
 */
import { Children, cloneElement, isValidElement, type ReactNode } from 'react'
import {
  Modal as RNModal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native'

import { useBreakpoint, useTheme } from '../theme/ThemeProvider'
import { IconButton } from './Button'
import { Divider, HStack, VStack } from './Stack'
import { Text } from './Text'

export type ModalSize = 'sm' | 'md' | 'lg' | 'full'

/**
 * Panel widths.
 *
 * Component-level layout constants rather than tokens, exactly as `Button`'s `SIZE_SPEC`
 * is: these are the geometry of one component, not values other components should share.
 * Everything *visual* (colour, radius, elevation, spacing) still comes from the theme.
 *
 * The widths are reading measures, not arbitrary: `sm` fits a confirmation sentence,
 * `md` a short form, `lg` a two-column form or a small table. `full` fills the padded
 * viewport and exists for previews and embedded editors.
 */
const PANEL_MAX_WIDTH: Record<ModalSize, number | null> = {
  sm: 400,
  md: 560,
  lg: 760,
  full: null,
}

/**
 * How much of the screen a bottom sheet may occupy.
 *
 * Deliberately short of 100% so a strip of scrim stays visible above the sheet — that
 * strip is what tells the user there is still a page behind it and that the sheet is
 * dismissible. A sheet that reaches the top edge reads as a full screen instead.
 */
const SHEET_MAX_HEIGHT = '90%' as const

/** Grabber bar geometry. Purely an affordance; see the note at its render site. */
const GRABBER = { width: 36, height: 4 } as const

/* -------------------------------------------------------------------------- */
/*                              Shared dialog parts                            */
/* -------------------------------------------------------------------------- */

export type DialogHeaderProps = {
  title?: string
  description?: string
  onClose: () => void
  /** Hide the close affordance for dialogs that demand an explicit decision. */
  showCloseButton?: boolean
  /** Custom close glyph. The system ships no icon dependency, so icons arrive as nodes. */
  closeIcon?: ReactNode
  closeAccessibilityLabel?: string
  titleVariant?: 'heading' | 'titleSm'
  testID?: string
}

/**
 * Title, optional description and close button.
 *
 * Shared by `Modal` and `Drawer` so the two surfaces cannot drift apart: a change to the
 * header rhythm lands in both at once. It renders nothing at all when it would be empty,
 * so a bare-content dialog does not pay for a stray divider.
 */
export function DialogHeader({
  title,
  description,
  onClose,
  showCloseButton = true,
  closeIcon,
  closeAccessibilityLabel = 'Close',
  titleVariant = 'titleSm',
  testID,
}: DialogHeaderProps) {
  const theme = useTheme()

  if (!title && !description && !showCloseButton) return null

  return (
    <>
      <HStack
        testID={testID}
        gap={4}
        align="flex-start"
        style={{
          paddingHorizontal: theme.spacing[5],
          paddingTop: theme.spacing[5],
          paddingBottom: theme.spacing[4],
        }}
      >
        <VStack gap={1} flex={1}>
          {title ? <Text variant={titleVariant}>{title}</Text> : null}
          {description ? (
            <Text variant="bodySm" tone="muted">
              {description}
            </Text>
          ) : null}
        </VStack>

        {showCloseButton ? (
          <IconButton
            variant="ghost"
            size="lg"
            onPress={onClose}
            accessibilityLabel={closeAccessibilityLabel}
            icon={
              closeIcon ?? (
                <Text variant="heading" tone="muted">
                  {'✕'}
                </Text>
              )
            }
            // `lg` is already 46pt, but the minimum is asserted from the token so a change
            // to the Button size scale can never quietly drop this below 44.
            style={{
              minWidth: theme.layout.minTouchTarget,
              minHeight: theme.layout.minTouchTarget,
              // Pull the button back toward the panel edge: its transparent hit area is
              // wider than its visible glyph, so without this the header looks off-centre.
              marginRight: -theme.spacing[2],
              marginTop: -theme.spacing[1],
            }}
          />
        ) : null}
      </HStack>
      <Divider />
    </>
  )
}

export type DialogBodyProps = {
  children?: ReactNode
  style?: StyleProp<ViewStyle>
  testID?: string
}

/**
 * The only scrolling region.
 *
 * `flexShrink: 1` is the load-bearing line: it lets the panel shrink to the space the
 * viewport actually offers, which is what keeps the header and footer pinned while the
 * content between them scrolls. Without it the panel grows past the screen and the footer
 * disappears off the bottom.
 */
export function DialogBody({ children, style, testID }: DialogBodyProps) {
  const theme = useTheme()

  if (children === undefined || children === null) return null

  return (
    <ScrollView
      testID={testID}
      style={[{ flexShrink: 1 }, style]}
      contentContainerStyle={{
        padding: theme.spacing[5],
        gap: theme.spacing[4],
      }}
      // Lets a press on a button inside the body work on the first tap while a text
      // input in the same body has focus, instead of being eaten by the dismiss.
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  )
}

export type DialogFooterProps = {
  children?: ReactNode
  /** Stack actions vertically and stretch them — used below the `md` breakpoint. */
  stacked?: boolean
  testID?: string
}

/**
 * Action row.
 *
 * On desktop actions sit right-aligned in the reading direction's terminal position, in
 * source order — so `<Button>Cancel</Button><Button variant="primary">Save</Button>` puts
 * the primary action last, where the pointer ends up.
 *
 * On small screens they stack full width. The stacking order is *not* reversed: the last
 * action stays at the bottom, nearest the thumb, which is where the confirming action
 * belongs on a sheet anchored to the bottom edge.
 *
 * `fullWidth` is cloned onto composite children rather than being left to the caller,
 * because a footer that stacks but whose buttons stay content-width looks broken, and
 * making every call site branch on the breakpoint defeats the point of the primitive.
 * Host elements are skipped so react-native-web never sees an unknown DOM prop.
 */
export function DialogFooter({ children, stacked = false, testID }: DialogFooterProps) {
  const theme = useTheme()

  if (children === undefined || children === null) return null

  const actions = stacked
    ? Children.map(children, (child) => {
        if (!isValidElement<{ fullWidth?: boolean }>(child)) return child
        if (typeof child.type === 'string') return child
        return cloneElement(child, { fullWidth: true })
      })
    : children

  return (
    <>
      <Divider />
      <View
        testID={testID}
        style={{
          flexDirection: stacked ? 'column' : 'row',
          justifyContent: 'flex-end',
          alignItems: stacked ? 'stretch' : 'center',
          gap: theme.spacing[2],
          padding: theme.spacing[5],
        }}
      >
        {actions}
      </View>
    </>
  )
}

/* -------------------------------------------------------------------------- */
/*                                    Modal                                    */
/* -------------------------------------------------------------------------- */

export type ModalProps = {
  open: boolean
  /** Called by the close button, the backdrop, Escape and Android back. */
  onClose: () => void
  /** Becomes the dialog's accessible name. Omit only for purely visual overlays. */
  title?: string
  description?: string
  children?: ReactNode
  /** Action buttons. Right-aligned on desktop, stacked full width on phones. */
  footer?: ReactNode
  size?: ModalSize
  closeOnBackdropPress?: boolean
  showCloseButton?: boolean
  closeIcon?: ReactNode
  closeAccessibilityLabel?: string
  /** Escape hatch for the panel only — the backdrop is not stylable by design. */
  style?: StyleProp<ViewStyle>
  testID?: string
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  closeOnBackdropPress = true,
  showCloseButton = true,
  closeIcon,
  closeAccessibilityLabel = 'Close',
  style,
  testID,
}: ModalProps) {
  const theme = useTheme()
  const isSheet = useBreakpoint() === 'sm'

  const maxWidth = PANEL_MAX_WIDTH[size]

  // Rounded top corners only on a sheet: the bottom edge is flush with the screen, and
  // rounding a corner that touches the screen edge just leaks the backdrop into it.
  const cornerRadius: ViewStyle = isSheet
    ? {
        borderTopLeftRadius: theme.radius['2xl'],
        borderTopRightRadius: theme.radius['2xl'],
      }
    : { borderRadius: theme.radius['2xl'] }

  return (
    <RNModal
      visible={open}
      transparent
      // The sheet rises from the bottom edge it is anchored to; the centred dialog fades,
      // because sliding a centred card implies a direction it does not have. Both are RN's
      // built-in transitions, which run on the platform's own compositor.
      animationType={isSheet ? 'slide' : 'fade'}
      // Android: draw under the status bar so the scrim covers the whole screen.
      statusBarTranslucent
      supportedOrientations={['portrait', 'landscape']}
      onRequestClose={onClose}
    >
      <View
        testID={testID}
        style={{
          flex: 1,
          zIndex: theme.zIndex.modal,
          justifyContent: isSheet ? 'flex-end' : 'center',
          alignItems: 'center',
          padding: isSheet ? theme.spacing[0] : theme.spacing[6],
        }}
      >
        {/*
          Scrim. Hidden from assistive tech: a full-screen button announced before the
          dialog content is noise, and keyboard users already have Escape. Sighted pointer
          users keep the affordance.
        */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={closeOnBackdropPress ? onClose : undefined}
          disabled={!closeOnBackdropPress}
          focusable={false}
          accessible={false}
          importantForAccessibility="no-hide-descendants"
        >
          <View
            style={{
              flex: 1,
              backgroundColor: theme.color.overlay,
              cursor: closeOnBackdropPress ? 'pointer' : 'auto',
            }}
          />
        </Pressable>

        {/*
          Panel. A sibling of the scrim, so presses on it never reach the scrim's handler.
          The shadow lives here and clipping lives on the inner view: on iOS `overflow:
          hidden` sets masksToBounds, which would clip the view's own shadow away.
        */}
        <View
          role="dialog"
          aria-modal={true}
          accessibilityViewIsModal
          accessibilityLabel={title}
          style={[
            {
              width: '100%',
              ...(maxWidth !== null ? { maxWidth } : {}),
              // Bounded by the padded viewport on desktop; short of full height on a
              // sheet so the scrim stays visible above it.
              maxHeight: isSheet ? SHEET_MAX_HEIGHT : '100%',
              flexShrink: 1,
              backgroundColor: theme.color.surfaceRaised,
              ...cornerRadius,
              ...theme.elevation.xl,
            },
            style,
          ]}
        >
          <View style={{ flexShrink: 1, overflow: 'hidden', ...cornerRadius }}>
            {isSheet ? (
              <View
                pointerEvents="none"
                style={{
                  alignSelf: 'center',
                  width: GRABBER.width,
                  height: GRABBER.height,
                  marginTop: theme.spacing[2],
                  borderRadius: theme.radius.full,
                  backgroundColor: theme.color.borderStrong,
                }}
              />
            ) : null}

            <DialogHeader
              title={title}
              description={description}
              onClose={onClose}
              showCloseButton={showCloseButton}
              closeIcon={closeIcon}
              closeAccessibilityLabel={closeAccessibilityLabel}
            />
            <DialogBody>{children}</DialogBody>
            <DialogFooter stacked={isSheet}>{footer}</DialogFooter>
          </View>
        </View>
      </View>
    </RNModal>
  )
}
