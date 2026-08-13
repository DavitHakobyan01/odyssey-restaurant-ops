/* TEMPORARY verification harness — deleted immediately after running. */
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import * as schema from '@odyssey/types/db'

import type { Database } from '../src/db/client'
import { toCustomerWithStats } from '../src/mappers'
import * as repo from '../src/repositories/customers.repository'

const client = postgres('postgres://u:p@localhost:5432/x', { max: 1 })

/*
 * Simulate what postgres-js hands back AFTER drizzle installs its identity parser for
 * timestamp OIDs: timestamps arrive as raw strings, ::int casts as numbers.
 * Column order matches the SELECT list: id, name, email, phone, notes, created_at,
 * updated_at, orderCount, totalSpentCents, lastOrderAt.
 */
const withOrders = [
  '3f1c1c9e-1a2b-4c3d-8e5f-6a7b8c9d0e1f',
  'Ann Example',
  'ann@example.com',
  null,
  null,
  '2026-01-01 10:00:00+00',
  '2026-01-02 10:00:00+00',
  3,
  7500,
  '2026-08-01 18:30:00+00',
]
const neverOrdered = [
  '4f1c1c9e-1a2b-4c3d-8e5f-6a7b8c9d0e1f',
  'New Customer',
  'new@example.com',
  null,
  null,
  '2026-01-01 10:00:00+00',
  '2026-01-02 10:00:00+00',
  0,
  0,
  null,
]

let call = 0
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(client as any).unsafe = () => {
  const rows = call++ === 0 ? [withOrders, neverOrdered] : [[2]]
  return Object.assign(Promise.resolve(rows), { values: () => Promise.resolve(rows) })
}

const db = drizzle(client, { schema }) as unknown as Database

async function main() {
  const { rows, total } = await repo.listWithStats(db, {
    limit: 25,
    offset: 0,
    sortBy: 'lastOrderAt',
    sortDir: 'desc',
  })

  console.log('total:', total)
  for (const row of rows) {
    console.log('--- raw row ---')
    console.log('  lastOrderAt is Date:', row.lastOrderAt instanceof Date)
    console.log('  lastOrderAt value  :', row.lastOrderAt)
    console.log('  orderCount type    :', typeof row.orderCount, row.orderCount)
    console.log('  totalSpentCents    :', typeof row.totalSpentCents, row.totalSpentCents)
    console.log('  mapped DTO         :', JSON.stringify(toCustomerWithStats(row)))
  }

  await client.end({ timeout: 1 })
}

void main()
