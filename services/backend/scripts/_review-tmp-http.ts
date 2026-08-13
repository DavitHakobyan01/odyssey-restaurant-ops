/* TEMPORARY review harness #3 — delete after running. */
import { createApp } from '../src/app'

const app = createApp()
const env = {
  DATABASE_URL: 'postgresql://odyssey:odyssey@localhost:5432/restaurant',
  CORS_ORIGIN: '*',
}

async function hit(path: string) {
  const res = await app.request(path, {}, env)
  const body = (await res.json()) as Record<string, any>
  console.log(`\nGET ${path} -> ${res.status}`)
  if (res.status !== 200) {
    console.log('  body:', JSON.stringify(body).slice(0, 300))
    return
  }
  const { dashboardOverviewSchema } = await import('@odyssey/types')
  const parsed = dashboardOverviewSchema.safeParse(body)
  console.log('  contract valid:', parsed.success)
  if (!parsed.success) console.log(JSON.stringify(parsed.error.issues, null, 2))
  for (const k of [
    'range',
    'totalOrders',
    'revenueCents',
    'pendingOrders',
    'inProgressOrders',
    'averageOrderValueCents',
  ]) {
    console.log(`  ${k} = ${JSON.stringify(body[k])} (${typeof body[k]})`)
  }
  console.log('  trendLen:', body.revenueTrend.length)
  console.log('  trend[0]:', JSON.stringify(body.revenueTrend[0]))
  console.log('  popular[0]:', JSON.stringify(body.popularItems[0]))
  console.log('  byStatus:', JSON.stringify(body.ordersByStatus))
}

async function main() {
  await hit('/stats/overview')
  await hit('/stats/overview?range=7d')
  await hit('/stats/overview?range=bogus')
  await hit('/stats/overview?range=')
}

void main()
