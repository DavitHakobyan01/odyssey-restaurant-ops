/* TEMPORARY review harness — delete after running. */
import { dashboardOverviewSchema, STATS_RANGES } from '@odyssey/types'

import { createDatabase } from '../src/db/client'
import * as repo from '../src/repositories/stats.repository'
import * as svc from '../src/services/stats.service'

const { db, close } = createDatabase('postgresql://odyssey:odyssey@localhost:5432/restaurant')

function describe(v: unknown): string {
  if (v === null) return 'null'
  if (v instanceof Date) return `Date(${v.toISOString()})`
  return `${typeof v}:${JSON.stringify(v)}`
}

async function main() {
  for (const range of STATS_RANGES) {
    console.log(`\n================ range=${range} ================`)

    // Raw repository output first — this is where a bigint-as-string would show.
    const totals = await repo.getRangeTotals(db, range)
    console.log('getRangeTotals:', Object.entries(totals).map(([k, v]) => `${k}=${describe(v)}`).join(' '))

    const live = await repo.countLiveOrders(db, {
      pending: 'pending',
      inProgress: ['accepted', 'preparing', 'ready'],
    })
    console.log('countLiveOrders:', Object.entries(live).map(([k, v]) => `${k}=${describe(v)}`).join(' '))

    const byStatus = await repo.countOrdersByStatus(db, range)
    console.log('countOrdersByStatus:', byStatus.map((r) => `${r.status}=${describe(r.count)}`).join(' '))

    const top = await repo.findTopSellingItems(db, range, 5)
    for (const t of top) {
      console.log(
        `  top: name=${describe(t.name)} qty=${describe(t.quantitySold)} rev=${describe(t.revenueCents)} id=${describe(t.menuItemId)}`,
      )
    }

    const trend = await repo.getRevenueTrend(db, range)
    console.log(`trend buckets=${trend.length}`)
    if (trend[0]) {
      console.log(
        `  first: bucket=${describe(trend[0].bucket)} rev=${describe(trend[0].revenueCents)} n=${describe(trend[0].orderCount)}`,
      )
    }
    if (trend.at(-1)) {
      const l = trend.at(-1)!
      console.log(`  last : bucket=${describe(l.bucket)} rev=${describe(l.revenueCents)} n=${describe(l.orderCount)}`)
    }

    const trendRevenue = trend.reduce((a, p) => a + p.revenueCents, 0)
    const trendOrders = trend.reduce((a, p) => a + p.orderCount, 0)
    console.log(
      `reconcile: headline revenue=${totals.revenueCents} trend=${trendRevenue} | headline orders=${totals.totalOrders} trend=${trendOrders}`,
    )

    const dto = await svc.getDashboardOverview(db, { range })
    const parsed = dashboardOverviewSchema.safeParse(dto)
    console.log('contract valid:', parsed.success)
    if (!parsed.success) console.log(JSON.stringify(parsed.error.issues, null, 2))
    console.log('dto sample:', JSON.stringify(dto).slice(0, 400))
  }

  await close()
}

void main().catch(async (e) => {
  console.error('THREW:', e)
  await close()
  process.exitCode = 1
})
