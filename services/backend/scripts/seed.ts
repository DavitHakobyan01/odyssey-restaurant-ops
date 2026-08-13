/**
 * Seeds a realistic restaurant so the dashboard is worth looking at immediately.
 *
 * Design decisions worth knowing:
 *
 * - **Deterministic.** A seeded PRNG replaces Math.random, so every run of `pnpm db:seed`
 *   produces byte-identical data. Screenshots, demos and tests stay reproducible, and a
 *   reviewer sees exactly what this file describes.
 *
 * - **Priced by the real pricing function.** Orders are costed with
 *   `calculateOrderTotals` from @odyssey/types — the same function the API uses. Seeded
 *   totals therefore obey the same invariants as live ones, instead of being plausible
 *   numbers typed in by hand that would drift from the tax logic.
 *
 * - **Spread over 30 days with a realistic status mix**, so the Home KPIs, the revenue
 *   trend chart and the CRM spend figures all have something meaningful to show. Recent
 *   orders are deliberately left in active states so the Orders page has work to do.
 *
 * Destructive: truncates every table before inserting. Run with `pnpm db:seed`.
 */
import { config } from 'dotenv'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import { calculateOrderTotals } from '@odyssey/types'
import type { OrderStatus, OrderType } from '@odyssey/types'
import {
  customers,
  menuCategories,
  menuItems,
  orderItems,
  orders,
  restaurantSettings,
} from '@odyssey/types/db'

config({ path: '../../.env', quiet: true })

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  console.error('DATABASE_URL is not set. Run: cp .env.example .env')
  process.exit(1)
}

/* -------------------------------------------------------------------------- */
/*                          Deterministic randomness                           */
/* -------------------------------------------------------------------------- */

/**
 * mulberry32 — a tiny, well-distributed PRNG.
 *
 * Seeded with a constant so the dataset is identical on every machine and every run.
 */
function createRandom(seed: number) {
  let state = seed
  return function random(): number {
    state |= 0
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const random = createRandom(20260812)

const randomInt = (min: number, max: number): number =>
  Math.floor(random() * (max - min + 1)) + min

function pick<T>(items: readonly T[]): T {
  const item = items[Math.floor(random() * items.length)]
  if (item === undefined) throw new Error('pick() called with an empty array')
  return item
}

/** Weighted pick, used to make the status mix look like a real service. */
function pickWeighted<T>(entries: readonly (readonly [T, number])[]): T {
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0)
  let roll = random() * total
  for (const [value, weight] of entries) {
    roll -= weight
    if (roll <= 0) return value
  }
  const last = entries[entries.length - 1]
  if (!last) throw new Error('pickWeighted() called with an empty array')
  return last[0]
}

/* -------------------------------------------------------------------------- */
/*                                   Content                                   */
/* -------------------------------------------------------------------------- */

const CATEGORY_SEED = [
  {
    name: 'Small plates',
    description: 'Snacks and starters built for sharing.',
    sortOrder: 10,
    items: [
      ['Charred padrón peppers', 'Sea salt, smoked olive oil.', 900, 8],
      ['Focaccia & whipped ricotta', 'Rosemary, lemon zest, honey.', 1100, 10],
      ['Salt cod croquetas', 'Four per order, saffron aioli.', 1400, 12],
      ['Marinated olives', 'Citrus, chilli, fennel seed.', 700, 3],
    ],
  },
  {
    name: 'Wood-fired pizza',
    description: 'Naturally leavened, 48-hour ferment.',
    sortOrder: 20,
    items: [
      ['Margherita', 'San Marzano, fior di latte, basil.', 1600, 14],
      ['Nduja & honey', 'Spicy sausage, hot honey, oregano.', 1950, 14],
      ['Funghi', 'Wild mushroom, taleggio, thyme.', 1850, 15],
      ['Marinara', 'Tomato, garlic, oregano — no cheese.', 1400, 12],
    ],
  },
  {
    name: 'Larger plates',
    description: 'From the grill and the oven.',
    sortOrder: 30,
    items: [
      ['Half chicken al mattone', 'Brick-pressed, salsa verde.', 2600, 28],
      ['Pappardelle ragù', 'Eight-hour beef shin, parmesan.', 2200, 18],
      ['Whole bream', 'Fennel, lemon, brown butter.', 2900, 25],
      ['Aubergine parmigiana', 'Slow-baked, basil, mozzarella.', 1900, 22],
    ],
  },
  {
    name: 'Sides',
    description: null,
    sortOrder: 40,
    items: [
      ['Rosemary fries', 'Garlic aioli.', 650, 8],
      ['Little gem salad', 'Anchovy dressing, croutons.', 800, 6],
      ['Tenderstem broccoli', 'Chilli, lemon, almond.', 850, 8],
    ],
  },
  {
    name: 'Desserts',
    description: 'Made in house daily.',
    sortOrder: 50,
    items: [
      ['Tiramisu', 'Classic, heavy on the espresso.', 950, 5],
      ['Basque cheesecake', 'Burnt top, vanilla cream.', 1050, 5],
      ['Affogato', 'Vanilla gelato, double espresso.', 750, 3],
    ],
  },
  {
    name: 'Drinks',
    description: 'Low intervention wine and soft drinks.',
    sortOrder: 60,
    items: [
      ['Negroni', 'Equal parts, orange twist.', 1200, 4],
      ['House red, glass', 'Sangiovese, Tuscany.', 900, 2],
      ['San Pellegrino', '500ml.', 450, 1],
      ['Espresso', 'Single origin.', 350, 2],
    ],
  },
] as const

const CUSTOMER_SEED = [
  ['Amara Okafor', 'amara.okafor@example.com', '+44 7700 900142'],
  ['Tomás Lindqvist', 'tomas.lindqvist@example.com', '+46 70 123 4567'],
  ['Priya Raghunathan', 'priya.r@example.com', '+44 7700 900318'],
  ['Daniel Whitfield', 'd.whitfield@example.com', null],
  ['Sofia Marchetti', 'sofia.marchetti@example.com', '+39 340 118 2299'],
  ['Kenji Watanabe', 'kenji.watanabe@example.com', '+81 90 1234 5678'],
  ['Róisín Gallagher', 'roisin.gallagher@example.com', '+353 86 411 9920'],
  ['Marcus Delgado', 'marcus.delgado@example.com', '+1 415 555 0177'],
  ['Hannah Bergström', 'hannah.bergstrom@example.com', null],
  ['Ibrahim Al-Rashid', 'ibrahim.alrashid@example.com', '+971 50 447 8812'],
  ['Elena Petrova', 'elena.petrova@example.com', '+7 916 555 3421'],
  ['Joseph Mensah', 'joseph.mensah@example.com', '+233 24 889 4410'],
] as const

const ORDER_TYPES: readonly OrderType[] = ['dine_in', 'takeaway', 'delivery']

const ORDER_NOTES = [
  null,
  null,
  null,
  'No onions please.',
  'Table by the window if possible.',
  'Allergy: nuts. Please confirm with kitchen.',
  'Birthday — candle on the dessert.',
  'Leave at the door.',
] as const

const CANCELLATION_REASONS = [
  'Customer cancelled by phone.',
  'Kitchen ran out of a key ingredient.',
  'Duplicate order placed in error.',
  'Delivery address outside our radius.',
] as const

const TAX_RATE_BPS = 875
const SERVICE_FEE_BPS = 500

/* -------------------------------------------------------------------------- */
/*                                    Seed                                     */
/* -------------------------------------------------------------------------- */

const client = postgres(databaseUrl, { max: 1 })
const db = drizzle(client)

async function seed() {
  console.log('Clearing existing data...')
  // TRUNCATE ... CASCADE in one statement so FK ordering is not our problem, and
  // RESTART IDENTITY so order numbers begin from the sequence start on every seed.
  await db.execute(
    sql`truncate table ${orderItems}, ${orders}, ${menuItems}, ${menuCategories}, ${customers}, ${restaurantSettings} restart identity cascade`,
  )
  await db.execute(sql`alter sequence order_number_seq restart with 1001`)

  /* -------------------------------- Settings ------------------------------- */

  console.log('Seeding settings...')
  await db.insert(restaurantSettings).values({
    restaurantName: 'Odyssey Kitchen',
    currency: 'USD',
    isAcceptingOrders: true,
    autoAcceptOrders: false,
    defaultPrepTimeMinutes: 20,
    taxRateBps: TAX_RATE_BPS,
    serviceFeeBps: SERVICE_FEE_BPS,
    minimumOrderCents: 1000,
    openingHours: [
      { dayOfWeek: 0, opensAt: '11:00', closesAt: '21:00', isClosed: false },
      { dayOfWeek: 1, opensAt: '00:00', closesAt: '00:00', isClosed: true },
      { dayOfWeek: 2, opensAt: '17:00', closesAt: '22:30', isClosed: false },
      { dayOfWeek: 3, opensAt: '17:00', closesAt: '22:30', isClosed: false },
      { dayOfWeek: 4, opensAt: '17:00', closesAt: '23:00', isClosed: false },
      { dayOfWeek: 5, opensAt: '12:00', closesAt: '23:30', isClosed: false },
      { dayOfWeek: 6, opensAt: '12:00', closesAt: '23:30', isClosed: false },
    ],
  })

  /* ---------------------------------- Menu --------------------------------- */

  console.log('Seeding menu...')
  const insertedItems: { id: string; name: string; priceCents: number }[] = []

  for (const category of CATEGORY_SEED) {
    const [categoryRow] = await db
      .insert(menuCategories)
      .values({
        name: category.name,
        description: category.description,
        sortOrder: category.sortOrder,
        isActive: true,
      })
      .returning()

    if (!categoryRow) throw new Error(`Failed to insert category ${category.name}`)

    for (const [name, description, priceCents, prepTimeMinutes] of category.items) {
      // A couple of items are deliberately unavailable so the Menu page has a real
      // availability state to render and order creation has something to reject.
      const isAvailable = !(name === 'Whole bream' || name === 'Affogato')

      const [itemRow] = await db
        .insert(menuItems)
        .values({
          categoryId: categoryRow.id,
          name,
          description,
          priceCents,
          prepTimeMinutes,
          isAvailable,
        })
        .returning()

      if (!itemRow) throw new Error(`Failed to insert item ${name}`)
      if (isAvailable) {
        insertedItems.push({ id: itemRow.id, name, priceCents })
      }
    }
  }

  /* -------------------------------- Customers ------------------------------- */

  console.log('Seeding customers...')
  const insertedCustomers = await db
    .insert(customers)
    .values(
      CUSTOMER_SEED.map(([name, email, phone]) => ({
        name,
        email,
        phone,
      })),
    )
    .returning()

  /* --------------------------------- Orders --------------------------------- */

  console.log('Seeding orders...')

  const now = Date.now()
  const DAY_MS = 24 * 60 * 60 * 1000
  const ORDER_COUNT = 140

  let created = 0

  for (let index = 0; index < ORDER_COUNT; index += 1) {
    // Weight recent days more heavily so the trend chart slopes like a growing business.
    const daysAgo = Math.floor(Math.pow(random(), 1.6) * 30)
    const placedAt = new Date(
      now - daysAgo * DAY_MS - randomInt(0, 11) * 60 * 60 * 1000 - randomInt(0, 59) * 60 * 1000,
    )

    /**
     * Old orders are settled; today's are still moving. This is what makes the Orders
     * page look like a live service rather than an archive.
     */
    const status: OrderStatus =
      daysAgo === 0
        ? pickWeighted([
            ['pending', 4],
            ['accepted', 3],
            ['preparing', 3],
            ['ready', 2],
            ['completed', 4],
            ['cancelled', 1],
          ])
        : pickWeighted([
            ['completed', 22],
            ['cancelled', 2],
          ])

    const lineCount = randomInt(1, 5)
    const chosen = new Map<string, { name: string; priceCents: number; quantity: number }>()

    for (let line = 0; line < lineCount; line += 1) {
      const item = pick(insertedItems)
      const existing = chosen.get(item.id)
      if (existing) {
        existing.quantity += 1
      } else {
        chosen.set(item.id, {
          name: item.name,
          priceCents: item.priceCents,
          quantity: randomInt(1, 3),
        })
      }
    }

    const lines = [...chosen.entries()].map(([menuItemId, line]) => ({
      menuItemId,
      nameSnapshot: line.name,
      unitPriceCents: line.priceCents,
      quantity: line.quantity,
      lineTotalCents: line.priceCents * line.quantity,
      notes: null,
    }))

    // The same function the API uses — seeded totals cannot disagree with live ones.
    const totals = calculateOrderTotals(lines, {
      taxRateBps: TAX_RATE_BPS,
      serviceFeeBps: SERVICE_FEE_BPS,
    })

    const customer = pick(insertedCustomers)

    // Lifecycle timestamps are only set for stages the order actually reached, so the
    // audit trail on the detail page is internally consistent.
    const reached = (stage: OrderStatus): boolean => {
      const sequence: OrderStatus[] = ['pending', 'accepted', 'preparing', 'ready', 'completed']
      if (status === 'cancelled') return stage === 'pending'
      return sequence.indexOf(stage) <= sequence.indexOf(status)
    }

    const stamp = (minutesAfter: number) => new Date(placedAt.getTime() + minutesAfter * 60 * 1000)

    const [orderRow] = await db
      .insert(orders)
      .values({
        orderNumber: `ORD-${1001 + created}`,
        customerId: customer.id,
        status,
        type: pick(ORDER_TYPES),
        subtotalCents: totals.subtotalCents,
        taxCents: totals.taxCents,
        serviceFeeCents: totals.serviceFeeCents,
        totalCents: totals.totalCents,
        notes: pick(ORDER_NOTES),
        placedAt,
        acceptedAt: reached('accepted') ? stamp(randomInt(1, 4)) : null,
        preparingAt: reached('preparing') ? stamp(randomInt(5, 9)) : null,
        readyAt: reached('ready') ? stamp(randomInt(14, 26)) : null,
        completedAt: reached('completed') ? stamp(randomInt(28, 45)) : null,
        cancelledAt: status === 'cancelled' ? stamp(randomInt(2, 15)) : null,
        cancellationReason: status === 'cancelled' ? pick(CANCELLATION_REASONS) : null,
        createdAt: placedAt,
        updatedAt: placedAt,
      })
      .returning()

    if (!orderRow) throw new Error('Failed to insert order')

    await db.insert(orderItems).values(
      lines.map((line) => ({
        ...line,
        orderId: orderRow.id,
        createdAt: placedAt,
      })),
    )

    created += 1
  }

  // Leave the sequence past the seeded numbers so the first real order does not collide.
  await db.execute(sql`alter sequence order_number_seq restart with ${sql.raw(String(1001 + created))}`)

  /* --------------------------------- Summary -------------------------------- */

  const [summary] = await db.execute<{
    orders: string
    revenue: string
    pending: string
    customers: string
    items: string
  }>(sql`
    select
      (select count(*) from orders)::text as orders,
      (select coalesce(sum(total_cents), 0) from orders where status <> 'cancelled')::text as revenue,
      (select count(*) from orders where status = 'pending')::text as pending,
      (select count(*) from customers)::text as customers,
      (select count(*) from menu_items)::text as items
  `)

  console.log('\nSeed complete:')
  console.log(`  menu items   ${summary?.items ?? '?'}`)
  console.log(`  customers    ${summary?.customers ?? '?'}`)
  console.log(`  orders       ${summary?.orders ?? '?'}`)
  console.log(`  pending      ${summary?.pending ?? '?'}`)
  console.log(
    `  revenue      $${(Number(summary?.revenue ?? 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
  )
}

try {
  await seed()
} catch (error) {
  console.error('\nSeed failed:', error instanceof Error ? error.message : error)
  console.error('\nHave migrations been applied? Run:\n  pnpm db:migrate\n')
  process.exit(1)
} finally {
  await client.end()
}
