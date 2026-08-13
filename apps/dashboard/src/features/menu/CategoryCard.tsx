/**
 * One menu category and its items.
 *
 * Purely presentational — every action is a callback, so the card has no opinion about
 * mutations or caches and the Menu route stays readable as a list of these.
 *
 * The highest-frequency real action on this screen is toggling availability when the
 * kitchen runs out of something mid-service, so that is a single tap on a Switch in the
 * row rather than something buried in an edit modal.
 */
import {
  Badge,
  Button,
  Card,
  HStack,
  Spacer,
  Switch,
  Text,
  VStack,
  useTheme,
} from '@odyssey/ui'
import type { MenuCategoryWithItems, MenuItem } from '@odyssey/api-client'

import { useMoney } from '../../lib/useMoney'

export type CategoryCardProps = {
  category: MenuCategoryWithItems
  onAddItem: () => void
  onEditItem: (item: MenuItem) => void
  onToggleAvailability: (item: MenuItem, isAvailable: boolean) => void
  onDeleteItem: (item: MenuItem) => void
}

export function CategoryCard({
  category,
  onAddItem,
  onEditItem,
  onToggleAvailability,
  onDeleteItem,
}: CategoryCardProps) {
  const theme = useTheme()
  // Own hook call rather than a formatter threaded down as a prop: `useGetSettings` is a
  // React Query hook, so every card shares one response.
  const money = useMoney()

  return (
    <Card
      padding={0}
      header={
        <HStack align="center" gap={3}>
          <Text variant="heading">{category.name}</Text>
          <Badge tone="neutral" size="sm" variant="subtle">
            {String(category.items.length)}
          </Badge>
          <Spacer />
          <Button variant="ghost" size="sm" onPress={onAddItem}>
            Add item
          </Button>
        </HStack>
      }
    >
      {category.items.length === 0 ? (
        <VStack padding={5}>
          <Text variant="bodySm" tone="subtle">
            No items in this category yet.
          </Text>
        </VStack>
      ) : (
        category.items.map((item, index) => (
          <HStack
            key={item.id}
            gap={4}
            align="center"
            style={{
              paddingHorizontal: theme.spacing[5],
              paddingVertical: theme.spacing[3],
              borderTopWidth: index === 0 ? 0 : theme.borderWidth.hairline,
              borderTopColor: theme.color.borderSubtle,
            }}
          >
            <VStack gap={0.5} style={{ flex: 1, minWidth: 0 }}>
              <Text variant="bodyMedium" numberOfLines={1}>
                {item.name}
              </Text>
              {item.description ? (
                <Text variant="caption" tone="subtle" numberOfLines={1}>
                  {item.description}
                </Text>
              ) : null}
            </VStack>

            <Text variant="bodySm" numeric weight="600">
              {money.format(item.priceCents)}
            </Text>

            <Switch
              value={item.isAvailable}
              onValueChange={(next) => onToggleAvailability(item, next)}
              size="sm"
              accessibilityLabel={`${item.name} available to order`}
            />

            <Button
              variant="ghost"
              size="sm"
              onPress={() => onEditItem(item)}
              accessibilityLabel={`Edit ${item.name}`}
            >
              Edit
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onPress={() => onDeleteItem(item)}
              accessibilityLabel={`Delete ${item.name}`}
            >
              Delete
            </Button>
          </HStack>
        ))
      )}
    </Card>
  )
}
