/**
 * UI library — the design system, rendered.
 *
 * This route exists so the system can be reviewed as a whole rather than inferred from
 * the five product screens. It makes no API calls; everything here is local fixture data.
 *
 * Every swatch and example is labelled with the exact token or prop name a developer
 * would type, so the page doubles as the system's documentation. The theme toggle is the
 * most useful control on it: both themes must be inspectable side by side, because "dark
 * mode works by construction" is a claim this page lets you check.
 */
import { useState } from 'react'

import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  Checkbox,
  Divider,
  Drawer,
  EmptyState,
  ErrorState,
  Field,
  HStack,
  IconButton,
  Input,
  Modal,
  MoneyInput,
  MonoText,
  PageHeader,
  Select,
  Skeleton,
  SkeletonText,
  Spinner,
  StatusDot,
  Switch,
  Table,
  Tabs,
  Text,
  Textarea,
  TONES,
  VStack,
  elevation,
  palette,
  radius,
  spacing,
  typography,
  useTheme,
  useThemeControls,
  useToast,
} from '@odyssey/ui'
import type { Tone } from '@odyssey/ui'

import { CheckIcon, MoonIcon, PlusIcon, SearchIcon, SunIcon } from '../../../src/components/icons'

const SECTIONS = [
  { key: 'tokens', label: 'Tokens' },
  { key: 'typography', label: 'Typography' },
  { key: 'surfaces', label: 'Surfaces' },
  { key: 'components', label: 'Components' },
  { key: 'states', label: 'States' },
] as const

type SectionKey = (typeof SECTIONS)[number]['key']

export default function UiLibraryScreen() {
  const theme = useTheme()
  const { mode, toggleMode } = useThemeControls()
  const [section, setSection] = useState<SectionKey>('tokens')

  return (
    <VStack gap={5}>
      <PageHeader
        title="UI library"
        description="Every token and primitive in @odyssey/ui, labelled with the name you would type."
        actions={
          <Button
            variant="secondary"
            onPress={toggleMode}
            iconLeft={
              mode === 'dark' ? (
                <SunIcon size={16} color={theme.color.text} />
              ) : (
                <MoonIcon size={16} color={theme.color.text} />
              )
            }
          >
            {mode === 'dark' ? 'Light theme' : 'Dark theme'}
          </Button>
        }
      />

      <Tabs
        items={SECTIONS.map((entry) => ({ key: entry.key, label: entry.label }))}
        value={section}
        onChange={(key) => setSection(key as SectionKey)}
        accessibilityLabel="Design system sections"
      />

      {section === 'tokens' ? <TokensSection /> : null}
      {section === 'typography' ? <TypographySection /> : null}
      {section === 'surfaces' ? <SurfacesSection /> : null}
      {section === 'components' ? <ComponentsSection /> : null}
      {section === 'states' ? <StatesSection /> : null}
    </VStack>
  )
}

/* -------------------------------------------------------------------------- */
/*                                   Tokens                                    */
/* -------------------------------------------------------------------------- */

function TokensSection() {
  const theme = useTheme()

  const groups: { title: string; tokens: (keyof typeof theme.color)[] }[] = [
    {
      title: 'Surfaces',
      tokens: ['background', 'backgroundSubtle', 'surface', 'surfaceRaised', 'surfaceSunken', 'surfaceHover', 'surfaceActive', 'surfaceDisabled'],
    },
    { title: 'Borders', tokens: ['border', 'borderSubtle', 'borderStrong', 'borderFocus'] },
    { title: 'Text', tokens: ['text', 'textMuted', 'textSubtle', 'textDisabled', 'textInverse'] },
    { title: 'Primary', tokens: ['primary', 'primaryHover', 'primaryActive', 'primarySubtle', 'primaryBorder', 'primaryText'] },
    { title: 'Success', tokens: ['success', 'successSubtle', 'successBorder', 'successText'] },
    { title: 'Warning', tokens: ['warning', 'warningSubtle', 'warningBorder', 'warningText'] },
    { title: 'Danger', tokens: ['danger', 'dangerHover', 'dangerSubtle', 'dangerBorder', 'dangerText'] },
    { title: 'Info', tokens: ['info', 'infoSubtle', 'infoBorder', 'infoText'] },
    { title: 'Neutral', tokens: ['neutral', 'neutralSubtle', 'neutralBorder', 'neutralText'] },
  ]

  return (
    <VStack gap={5}>
      <Card padding={5} header={<Text variant="heading">Semantic colour tokens</Text>}>
        <VStack gap={5}>
          <Text variant="bodySm" tone="muted">
            Components only ever reference these. Switching the theme remaps them; no
            component contains a colour of its own.
          </Text>
          {groups.map((group) => (
            <VStack key={group.title} gap={2}>
              <Text variant="caption" tone="subtle" weight="600">
                {group.title.toUpperCase()}
              </Text>
              <HStack gap={3} wrap>
                {group.tokens.map((token) => (
                  <VStack key={String(token)} gap={1} style={{ width: 132 }}>
                    <VStack
                      style={{
                        height: 44,
                        borderRadius: theme.radius.md,
                        backgroundColor: theme.color[token],
                        borderWidth: theme.borderWidth.hairline,
                        borderColor: theme.color.border,
                      }}
                    />
                    {/* Labelled with the full accessor a developer would type. */}
                    <MonoText variant="caption" tone="muted" numberOfLines={1}>
                      {`color.${String(token)}`}
                    </MonoText>
                  </VStack>
                ))}
              </HStack>
            </VStack>
          ))}
        </VStack>
      </Card>

      <Card padding={5} header={<Text variant="heading">Palette ramps</Text>}>
        <VStack gap={4}>
          <Text variant="bodySm" tone="muted">
            The raw ramps in `tokens/palette.ts` — the only hex literals in the codebase.
            Components never import these directly.
          </Text>
          {Object.entries(palette).map(([rampName, ramp]) => (
            <VStack key={rampName} gap={1.5}>
              <MonoText variant="caption" tone="muted">
                palette.{rampName}
              </MonoText>
              <HStack gap={1} wrap>
                {Object.entries(ramp).map(([step, value]) => (
                  <VStack key={step} gap={1} align="center" style={{ width: 54 }}>
                    <VStack
                      style={{
                        height: 34,
                        width: '100%',
                        borderRadius: theme.radius.sm,
                        backgroundColor: value as string,
                        borderWidth: theme.borderWidth.hairline,
                        borderColor: theme.color.border,
                      }}
                    />
                    <Text variant="caption" tone="subtle">
                      {step}
                    </Text>
                  </VStack>
                ))}
              </HStack>
            </VStack>
          ))}
        </VStack>
      </Card>

      <Card padding={5} header={<Text variant="heading">Spacing scale</Text>}>
        <VStack gap={2}>
          {Object.entries(spacing)
            .filter(([, value]) => typeof value === 'number' && value > 0)
            .map(([key, value]) => (
              <HStack key={key} gap={3} align="center">
                <MonoText variant="caption" tone="muted" style={{ width: 78 }}>
                  spacing[{key}]
                </MonoText>
                <VStack
                  style={{
                    width: value as number,
                    height: 14,
                    borderRadius: theme.radius.sm,
                    backgroundColor: theme.color.primary,
                  }}
                />
                <Text variant="caption" tone="subtle">
                  {value as number}px
                </Text>
              </HStack>
            ))}
        </VStack>
      </Card>
    </VStack>
  )
}

/* -------------------------------------------------------------------------- */
/*                                 Typography                                  */
/* -------------------------------------------------------------------------- */

function TypographySection() {
  return (
    <Card padding={5} header={<Text variant="heading">Type scale</Text>}>
      <VStack gap={5}>
        {Object.entries(typography).map(([name, scale]) => (
          <VStack key={name} gap={1}>
            <HStack gap={3} align="center">
              <MonoText variant="caption" tone="muted">
                {name}
              </MonoText>
              <Text variant="caption" tone="subtle">
                {scale.fontSize}px / {scale.lineHeight}px · weight {scale.fontWeight}
              </Text>
            </HStack>
            <Text variant={name as keyof typeof typography}>
              The quick brown fox jumps over the lazy dog
            </Text>
          </VStack>
        ))}
        <Divider />
        <VStack gap={1}>
          <MonoText variant="caption" tone="muted">
            numeric (tabular figures)
          </MonoText>
          <Text variant="titleSm" numeric>
            1,234.56 · 9,876.54 · 1,111.11
          </Text>
          <Text variant="caption" tone="subtle">
            Used for every money column so digits align vertically.
          </Text>
        </VStack>
      </VStack>
    </Card>
  )
}

/* -------------------------------------------------------------------------- */
/*                                  Surfaces                                   */
/* -------------------------------------------------------------------------- */

function SurfacesSection() {
  const theme = useTheme()

  return (
    <VStack gap={5}>
      <Card padding={5} header={<Text variant="heading">Radius</Text>}>
        <HStack gap={4} wrap>
          {Object.entries(radius).map(([name, value]) => (
            <VStack key={name} gap={2} align="center" style={{ width: 96 }}>
              <VStack
                style={{
                  width: 72,
                  height: 56,
                  borderRadius: value as number,
                  backgroundColor: theme.color.primarySubtle,
                  borderWidth: theme.borderWidth.hairline,
                  borderColor: theme.color.primaryBorder,
                }}
              />
              <MonoText variant="caption" tone="muted">
                {name}
              </MonoText>
            </VStack>
          ))}
        </HStack>
      </Card>

      <Card padding={5} header={<Text variant="heading">Elevation</Text>}>
        <HStack gap={5} wrap style={{ paddingVertical: theme.spacing[3] }}>
          {Object.keys(elevation).map((name) => (
            <VStack key={name} gap={2} align="center" style={{ width: 120 }}>
              <Card padding={4} elevation={name as keyof typeof elevation} style={{ width: '100%' }}>
                <Text variant="caption" tone="muted" align="center">
                  {name}
                </Text>
              </Card>
              <MonoText variant="caption" tone="subtle">
                elevation.{name}
              </MonoText>
            </VStack>
          ))}
        </HStack>
      </Card>
    </VStack>
  )
}

/* -------------------------------------------------------------------------- */
/*                                 Components                                  */
/* -------------------------------------------------------------------------- */

type DemoRow = { id: string; item: string; qty: number; total: string }

const DEMO_ROWS: DemoRow[] = [
  { id: '1', item: 'Margherita', qty: 2, total: '$32.00' },
  { id: '2', item: 'Nduja & honey', qty: 1, total: '$19.50' },
  { id: '3', item: 'Rosemary fries', qty: 3, total: '$19.50' },
]

function ComponentsSection() {
  const theme = useTheme()
  const toast = useToast()
  const [text, setText] = useState('')
  const [money, setMoney] = useState(1650)
  const [selected, setSelected] = useState('takeaway')
  const [switched, setSwitched] = useState(true)
  const [checked, setChecked] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <VStack gap={5}>
      <Card padding={5} header={<Text variant="heading">Button</Text>}>
        <VStack gap={4}>
          {(['primary', 'secondary', 'ghost', 'danger', 'dangerSubtle'] as const).map((variant) => (
            <HStack key={variant} gap={3} align="center" wrap>
              <MonoText variant="caption" tone="muted" style={{ width: 108 }}>
                {variant}
              </MonoText>
              <Button variant={variant} size="sm">
                Small
              </Button>
              <Button variant={variant} size="md">
                Medium
              </Button>
              <Button variant={variant} size="lg">
                Large
              </Button>
              <Button variant={variant} disabled>
                Disabled
              </Button>
              <Button variant={variant} loading>
                Loading
              </Button>
            </HStack>
          ))}
          <Divider />
          <HStack gap={3} align="center">
            <MonoText variant="caption" tone="muted" style={{ width: 108 }}>
              IconButton
            </MonoText>
            <IconButton
              icon={<PlusIcon size={16} color={theme.color.text} />}
              accessibilityLabel="Add"
            />
            <IconButton
              variant="primary"
              icon={<CheckIcon size={16} color={theme.color.textInverse} />}
              accessibilityLabel="Confirm"
            />
          </HStack>
        </VStack>
      </Card>

      <Card padding={5} header={<Text variant="heading">Form controls</Text>}>
        <VStack gap={4}>
          <Field label="Input" helperText="With a leading slot.">
            <Input
              value={text}
              onChangeText={setText}
              placeholder="Search orders"
              leftSlot={<SearchIcon size={16} color={theme.color.textSubtle} />}
            />
          </Field>
          <Field label="Invalid input" error="This field is required.">
            <Input value="" onChangeText={() => {}} placeholder="Something" invalid />
          </Field>
          <Field label="Disabled input">
            <Input value="Cannot edit" onChangeText={() => {}} disabled />
          </Field>
          <Field label="MoneyInput" helperText="Takes and emits integer cents.">
            <MoneyInput value={money} onChangeValue={setMoney} />
          </Field>
          <Field label="Select">
            <Select
              value={selected}
              onChange={setSelected}
              options={[
                { label: 'Dine in', value: 'dine_in' },
                { label: 'Takeaway', value: 'takeaway' },
                { label: 'Delivery', value: 'delivery' },
              ]}
            />
          </Field>
          <Field label="Textarea">
            <Textarea value="" onChangeText={() => {}} placeholder="Order notes" />
          </Field>
          <Switch
            value={switched}
            onValueChange={setSwitched}
            label="Switch"
            description="Used for availability and settings toggles."
          />
          <Checkbox checked={checked} onChange={setChecked} label="Checkbox" />
          <Checkbox checked={false} indeterminate onChange={() => {}} label="Indeterminate" />
        </VStack>
      </Card>

      <Card padding={5} header={<Text variant="heading">Badge and status</Text>}>
        <VStack gap={4}>
          {(['subtle', 'solid', 'outline'] as const).map((variant) => (
            <HStack key={variant} gap={2} align="center" wrap>
              <MonoText variant="caption" tone="muted" style={{ width: 78 }}>
                {variant}
              </MonoText>
              {TONES.map((tone) => (
                <Badge key={tone} tone={tone as Tone} variant={variant}>
                  {tone}
                </Badge>
              ))}
            </HStack>
          ))}
          <HStack gap={3} align="center">
            <MonoText variant="caption" tone="muted" style={{ width: 78 }}>
              StatusDot
            </MonoText>
            {TONES.map((tone) => (
              <StatusDot key={tone} tone={tone as Tone} />
            ))}
          </HStack>
          <HStack gap={3} align="center">
            <MonoText variant="caption" tone="muted" style={{ width: 78 }}>
              Avatar
            </MonoText>
            <Avatar name="Amara Okafor" size="sm" />
            <Avatar name="Tomás Lindqvist" size="md" />
            <Avatar name="Priya Raghunathan" size="lg" />
          </HStack>
        </VStack>
      </Card>

      <Card padding={5} header={<Text variant="heading">Alert</Text>}>
        <VStack gap={3}>
          {TONES.map((tone) => (
            <Alert
              key={tone}
              tone={tone as Tone}
              title={`${tone} alert`}
              description="Inline banner used for page-level conditions."
            />
          ))}
        </VStack>
      </Card>

      <Card padding={0} header={<Text variant="heading">Table</Text>}>
        <Table
          data={DEMO_ROWS}
          keyExtractor={(row) => row.id}
          accessibilityLabel="Example table"
          columns={[
            { key: 'item', header: 'Item', render: (row) => <Text variant="bodySm">{row.item}</Text> },
            {
              key: 'qty',
              header: 'Qty',
              align: 'right',
              render: (row) => (
                <Text variant="bodySm" numeric>
                  {row.qty}
                </Text>
              ),
            },
            {
              key: 'total',
              header: 'Total',
              align: 'right',
              render: (row) => (
                <Text variant="bodySm" numeric weight="500">
                  {row.total}
                </Text>
              ),
            },
          ]}
        />
      </Card>

      <Card padding={0} header={<Text variant="heading">Table — loading</Text>}>
        <Table
          data={[] as DemoRow[]}
          loading
          loadingRowCount={3}
          keyExtractor={(row) => row.id}
          accessibilityLabel="Example loading table"
          columns={[
            { key: 'item', header: 'Item', render: (row) => <Text variant="bodySm">{row.item}</Text> },
            { key: 'qty', header: 'Qty', align: 'right', render: () => null },
            { key: 'total', header: 'Total', align: 'right', render: () => null },
          ]}
        />
      </Card>

      <Card padding={5} header={<Text variant="heading">Overlays and feedback</Text>}>
        <HStack gap={3} wrap>
          <Button variant="secondary" onPress={() => setModalOpen(true)}>
            Open Modal
          </Button>
          <Button variant="secondary" onPress={() => setDrawerOpen(true)}>
            Open Drawer
          </Button>
          <Button variant="secondary" onPress={() => toast.success('Saved', 'Your changes are live.')}>
            Success toast
          </Button>
          <Button
            variant="secondary"
            onPress={() => toast.error('Could not save', 'Danger toasts do not auto-dismiss.')}
          >
            Error toast
          </Button>
          <Button
            variant="secondary"
            onPress={() => toast.toast({ title: 'Heads up', tone: 'warning' })}
          >
            Warning toast
          </Button>
        </HStack>
      </Card>

      <Card padding={5} header={<Text variant="heading">Loading and empty</Text>}>
        <VStack gap={5}>
          <VStack gap={2}>
            <MonoText variant="caption" tone="muted">
              Skeleton / SkeletonText
            </MonoText>
            <Skeleton width={220} height={22} />
            <SkeletonText lines={3} />
          </VStack>
          <HStack gap={4} align="center">
            <MonoText variant="caption" tone="muted">
              Spinner
            </MonoText>
            <Spinner size="sm" />
            <Spinner size="md" />
          </HStack>
          <Divider />
          <EmptyState
            title="No orders yet"
            description="Orders placed through the API will appear here."
            action={<Button variant="primary">Create order</Button>}
          />
          <Divider />
          <ErrorState
            title="Could not load orders"
            description="The API did not respond."
            onRetry={() => toast.success('Retried')}
          />
        </VStack>
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Example modal"
        description="Becomes a bottom sheet on small screens."
        footer={
          <>
            <Button variant="secondary" onPress={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onPress={() => setModalOpen(false)}>
              Confirm
            </Button>
          </>
        }
      >
        <Text variant="bodySm">
          The body scrolls independently while the header and footer stay fixed.
        </Text>
      </Modal>

      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title="Example drawer">
        <VStack gap={3} padding={5}>
          <Text variant="bodySm">Slides in from the right; full width on small screens.</Text>
        </VStack>
      </Drawer>
    </VStack>
  )
}

/* -------------------------------------------------------------------------- */
/*                                   States                                    */
/* -------------------------------------------------------------------------- */

function StatesSection() {
  const [value, setValue] = useState('Editable')

  return (
    <Card padding={5} header={<Text variant="heading">Interaction states</Text>}>
      <VStack gap={5}>
        <Text variant="bodySm" tone="muted">
          Hover and focus are web-only — hover with a pointer, or press Tab to move focus.
          Focus rings are drawn outside the element's box so focusing never shifts layout.
        </Text>

        <VStack gap={3}>
          <MonoText variant="caption" tone="muted">
            Button
          </MonoText>
          <HStack gap={3} wrap align="center">
            <VStack gap={1} align="center">
              <Button variant="primary">Rest</Button>
              <Text variant="caption" tone="subtle">
                default
              </Text>
            </VStack>
            <VStack gap={1} align="center">
              <Button variant="primary" disabled>
                Disabled
              </Button>
              <Text variant="caption" tone="subtle">
                disabled
              </Text>
            </VStack>
            <VStack gap={1} align="center">
              <Button variant="primary" loading>
                Loading
              </Button>
              <Text variant="caption" tone="subtle">
                loading
              </Text>
            </VStack>
          </HStack>
        </VStack>

        <Divider />

        <VStack gap={3}>
          <MonoText variant="caption" tone="muted">
            Input
          </MonoText>
          <Field label="Rest">
            <Input value={value} onChangeText={setValue} />
          </Field>
          <Field label="Invalid" error="Enter a valid email address.">
            <Input value="not-an-email" onChangeText={() => {}} invalid />
          </Field>
          <Field label="Disabled">
            <Input value="Read only" onChangeText={() => {}} disabled />
          </Field>
        </VStack>
      </VStack>
    </Card>
  )
}
