/**
 * Restaurant settings.
 *
 * These are not cosmetic preferences — the order service reads them on every create.
 * `isAcceptingOrders` gates order intake entirely, `autoAcceptOrders` decides the initial
 * status, and the two rate fields drive server-side pricing. The UI says so explicitly,
 * because an operator flipping a switch here changes what the API does.
 *
 * This file is layout only. The form engine — the draft, the basis-point translation, the
 * validation and the partial PATCH — lives in `useSettingsForm`.
 */
import { DAY_NAMES } from '@odyssey/shared'
import {
  Alert,
  Badge,
  Button,
  Card,
  ErrorState,
  Field,
  HStack,
  Input,
  MoneyInput,
  PageHeader,
  Select,
  Skeleton,
  Spacer,
  Switch,
  Text,
  VStack,
  useTheme,
  useThemeControls,
} from '@odyssey/ui'

import { useSettingsForm } from '../../../src/features/settings/useSettingsForm'
import { useMoney } from '../../../src/lib/useMoney'

export default function SettingsScreen() {
  const theme = useTheme()
  const { preference, setPreference } = useThemeControls()

  const {
    settings,
    draft,
    errors,
    hasErrors,
    isDirty,
    isLoading,
    isError,
    error,
    refetch,
    example,
    update,
    save,
    isSaving,
  } = useSettingsForm()

  if (isError) {
    return (
      <VStack gap={6}>
        <PageHeader title="Settings" />
        <ErrorState title="Could not load settings" error={error} onRetry={() => void refetch()} />
      </VStack>
    )
  }

  if (isLoading || !draft || !settings) {
    return (
      <VStack gap={6}>
        <PageHeader title="Settings" />
        {[0, 1, 2].map((key) => (
          <Card key={key} padding={5}>
            <VStack gap={3}>
              <Skeleton width={160} height={20} />
              <Skeleton width="100%" height={44} />
              <Skeleton width="100%" height={44} />
            </VStack>
          </Card>
        ))}
      </VStack>
    )
  }

  return (
    <VStack gap={5}>
      <PageHeader
        title="Settings"
        description="These values change what the ordering API accepts and how it prices orders."
        actions={
          <HStack gap={3} align="center">
            {isDirty ? (
              <Badge tone="warning" variant="subtle" size="sm">
                Unsaved changes
              </Badge>
            ) : null}
            <Button
              variant="primary"
              disabled={!isDirty || hasErrors}
              loading={isSaving}
              onPress={() => void save()}
            >
              Save changes
            </Button>
          </HStack>
        }
      />

      {!settings.isAcceptingOrders ? (
        <Alert
          tone="danger"
          title="Ordering is switched off"
          description="The API is rejecting every new order with ORDERS_DISABLED. Turn service availability back on to accept orders."
        />
      ) : null}

      {/* ------------------------ Service availability ----------------------- */}
      <Card padding={5} header={<Text variant="heading">Service availability</Text>}>
        <VStack gap={4}>
          <Switch
            value={draft.isAcceptingOrders}
            onValueChange={(value) => update('isAcceptingOrders', value)}
            label="Accepting orders"
            description="The master switch. While off, the API refuses every new order with a 422 — nothing reaches the kitchen."
          />
          <Field label="Restaurant name" required error={errors.restaurantName}>
            <Input
              value={draft.restaurantName}
              onChangeText={(value) => update('restaurantName', value)}
              invalid={Boolean(errors.restaurantName)}
            />
          </Field>
        </VStack>
      </Card>

      {/* -------------------------- Order handling --------------------------- */}
      <Card padding={5} header={<Text variant="heading">Order handling</Text>}>
        <VStack gap={4}>
          <Switch
            value={draft.autoAcceptOrders}
            onValueChange={(value) => update('autoAcceptOrders', value)}
            label="Auto-accept new orders"
            description="New orders skip 'pending' and are created as 'accepted', with the acceptance timestamp stamped."
          />
          <Field
            label="Default prep time"
            helperText="Minutes. Used for items that do not set their own."
            error={errors.defaultPrepTimeMinutes}
          >
            <Input
              invalid={Boolean(errors.defaultPrepTimeMinutes)}
              value={draft.defaultPrepTimeMinutes}
              onChangeText={(value) =>
                update('defaultPrepTimeMinutes', value.replace(/[^0-9]/g, ''))
              }
              keyboardType="number-pad"
            />
          </Field>
        </VStack>
      </Card>

      {/* ------------------------------ Pricing ------------------------------ */}
      <Card padding={5} header={<Text variant="heading">Pricing</Text>}>
        <VStack gap={4}>
          <HStack gap={4} wrap>
            <VStack style={{ flex: 1, minWidth: 180 }}>
              <Field
                label="Tax rate"
                helperText="Applied to the order subtotal."
                error={errors.taxRatePercent}
              >
                <Input
                  invalid={Boolean(errors.taxRatePercent)}
                  value={draft.taxRatePercent}
                  onChangeText={(value) =>
                    update('taxRatePercent', value.replace(/[^0-9.]/g, ''))
                  }
                  keyboardType="decimal-pad"
                  rightSlot={
                    <Text variant="bodySm" tone="subtle">
                      %
                    </Text>
                  }
                />
              </Field>
            </VStack>
            <VStack style={{ flex: 1, minWidth: 180 }}>
              <Field
                label="Service fee"
                helperText="Also applied to the subtotal, not compounded on tax."
                error={errors.serviceFeePercent}
              >
                <Input
                  invalid={Boolean(errors.serviceFeePercent)}
                  value={draft.serviceFeePercent}
                  onChangeText={(value) =>
                    update('serviceFeePercent', value.replace(/[^0-9.]/g, ''))
                  }
                  keyboardType="decimal-pad"
                  rightSlot={
                    <Text variant="bodySm" tone="subtle">
                      %
                    </Text>
                  }
                />
              </Field>
            </VStack>
          </HStack>

          <Field label="Minimum order" helperText="Orders below this subtotal are rejected with 422.">
            <MoneyInput
              value={draft.minimumOrderCents}
              onChangeValue={(value) => update('minimumOrderCents', value)}
            />
          </Field>

          {example ? (
            <VStack
              gap={2}
              style={{
                backgroundColor: theme.color.surfaceSunken,
                borderRadius: theme.radius.lg,
                padding: theme.spacing[4],
              }}
            >
              <Text variant="caption" tone="muted" weight="600">
                Worked example
              </Text>
              <ExampleRow label="Subtotal" cents={example.subtotalCents} />
              <ExampleRow label="Tax" cents={example.taxCents} />
              <ExampleRow label="Service fee" cents={example.serviceFeeCents} />
              <ExampleRow label="Customer pays" cents={example.totalCents} emphasis />
              <Text variant="caption" tone="subtle">
                Computed with the same pricing function the server uses for real orders.
              </Text>
            </VStack>
          ) : null}
        </VStack>
      </Card>

      {/* --------------------------- Opening hours --------------------------- */}
      <Card padding={5} header={<Text variant="heading">Opening hours</Text>}>
        <VStack gap={2}>
          {DAY_NAMES.map((dayName, index) => {
            const hours = settings.openingHours.find((entry) => entry.dayOfWeek === index)
            return (
              <HStack key={dayName} gap={3} align="center">
                <Text variant="bodySm" style={{ width: 96 }}>
                  {dayName}
                </Text>
                {hours && !hours.isClosed ? (
                  <Text variant="bodySm" tone="muted" numeric>
                    {hours.opensAt} – {hours.closesAt}
                  </Text>
                ) : (
                  <Badge tone="neutral" variant="subtle" size="sm">
                    Closed
                  </Badge>
                )}
              </HStack>
            )
          })}
          <Text variant="caption" tone="subtle">
            Opening hours are seeded and shown read-only here; editing them is noted as
            incomplete in docs/tradeoffs.md.
          </Text>
        </VStack>
      </Card>

      {/* ----------------------------- Appearance ---------------------------- */}
      <Card padding={5} header={<Text variant="heading">Appearance</Text>}>
        <Field label="Theme" helperText="Stored locally in this browser, not on the server.">
          <Select
            value={preference}
            onChange={(value) => setPreference(value as typeof preference)}
            options={[
              { label: 'Match system', value: 'system' },
              { label: 'Light', value: 'light' },
              { label: 'Dark', value: 'dark' },
            ]}
          />
        </Field>
      </Card>
    </VStack>
  )
}

function ExampleRow({
  label,
  cents,
  emphasis = false,
}: {
  label: string
  cents: number
  emphasis?: boolean
}) {
  const money = useMoney()

  return (
    <HStack align="center">
      <Text variant="bodySm" tone={emphasis ? 'default' : 'muted'} weight={emphasis ? '600' : '400'}>
        {label}
      </Text>
      <Spacer />
      <Text variant="bodySm" numeric weight={emphasis ? '600' : '500'}>
        {money.format(cents)}
      </Text>
    </HStack>
  )
}
