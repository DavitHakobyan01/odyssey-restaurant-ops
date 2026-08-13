/* TEMPORARY review harness #2 — delete after running. */
import { dashboardOverviewSchema } from '@odyssey/types'

import { createDatabase } from '../src/db/client'
import * as repo from '../src/repositories/stats.repository'
import * as svc from '../src/services/stats.service'

const { db, close } = createDatabase('postgresql://odyssey:odyssey@localhost:5432/restaurant')

class Rollback extends Error {}

async function scenario(name: string, mutate: (tx: any) => Promise<void>) {
  console.log(`\n############ ${name} ############`)
  try {
    await db.transaction(async (tx: any) => {
      await mutate(tx)
      for (const range of ['today', '7d', 'all'] as const) {
        try {
          const trend = await repo.getRevenueTrend(tx, range)
          const totals = await repo.getRangeTotals(tx, range)
          const top = await repo.findTopSellingItems(tx, range, 5)
          console.log(
            `[${range}] buckets=${trend.length} first=${JSON.stringify(trend[0])} totals=${JSON.stringify(totals)} top=${top.length}`,
          )
          const dto = await svc.getDashboardOverview(tx, { range })
          const parsed = dashboardOverviewSchema.safeParse(dto)
          console.log(`[${range}] contract valid=${parsed.success}`)
          if (!parsed.success) console.log(JSON.stringify(parsed.error.issues, null, 2))
          console.log(`[${range}] avg=${dto.averageOrderValueCents} trend[0]=${JSON.stringify(dto.revenueTrend[0])}`)
        } catch (e) {
          console.log(`[${range}] THREW: ${(e as Error).message}`)
        }
      }
      throw new Rollback()
    })
  } catch (e) {
    if (!(e instanceof Rollback)) console.log('scenario error:', e)
  }
}

async function main() {
  // Baseline: what type is `bucket` really?
  const trend = await repo.getRevenueTrend(db, 'today')
  const b = trend[0]!.bucket as unknown
  console.log('bucket runtime type:', typeof b, 'instanceof Date:', b instanceof Date, 'value:', b)
  console.log('toISOString would throw:', typeof (b as any).toISOString !== 'function')
  const dto = await svc.getDashboardOverview(db, { range: 'today' })
  console.log('mapped bucket:', dto.revenueTrend[0]!.bucket)
  console.log('mapped last  :', dto.revenueTrend.at(-1)!.bucket)

  await scenario('EMPTY: no orders at all', async (tx) => {
    await tx.execute(`delete from order_items`)
    await tx.execute(`delete from orders`)
  })

  await scenario('ONLY CANCELLED orders', async (tx) => {
    await tx.execute(`update orders set status = 'cancelled'`)
  })

  await scenario('ALL orders older than 30d (empty today window)', async (tx) => {
    await tx.execute(`update orders set placed_at = now() - interval '400 days'`)
  })

  await close()
}

void main().catch(async (e) => {
  console.error('THREW:', e)
  await close()
  process.exitCode = 1
})
