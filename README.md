# Odyssey Restaurant Operations

A fullstack restaurant operations product: menu management, order intake and lifecycle,
customer CRM, ordering settings, and a KPI dashboard.

Built as a pnpm + Turborepo monorepo with an Expo (React Native + Web) dashboard and a
Hono API on Cloudflare Workers, backed by PostgreSQL through Drizzle.

The organising idea is that **the database schema is the only place a data shape is
declared**. Everything downstream — validation, the OpenAPI document, the frontend types,
and the React Query hooks — is generated from it:

```
packages/types/src/db/schema.ts     Drizzle tables            <- the single source of truth
        |  drizzle-zod
        v
packages/types/src/contracts/       zod request/response schemas
        |  @hono/zod-openapi
        v
services/backend/openapi.json       OpenAPI 3.1 document      <- generated, committed
        |  Orval
        v
packages/api-client/src/generated/  TypeScript types + React Query hooks
        |
        v
apps/dashboard                      screens consume generated hooks only
```

No DTO is written by hand. No enum is declared twice. Changing a column and running
`pnpm gen:contract` propagates the change all the way into the dashboard's types, and a
mismatch becomes a compile error rather than a runtime surprise.

---

## Quick start

Requirements: **Node 20.19+ / 22.13+ / 24.3+ / 25+**, **pnpm 10+**, and Docker (or any
local PostgreSQL 15+).

```bash
# 1. Install
pnpm install

# 2. Environment
cp .env.example .env

# 3. Database — starts Postgres on :5432 with the exact credentials in .env.example
docker compose up -d

# 4. Schema + demo data
pnpm bootstrap        # runs db:migrate then db:seed

# 5. Run both apps (separate terminals)
pnpm dev:backend      # http://localhost:8787
pnpm dev:dashboard    # http://localhost:8081
```

Open <http://localhost:8081>. The dashboard is seeded with a full menu, 12 customers and
140 orders spread over 30 days, so every screen has real data on first load.

### Without Docker

Any PostgreSQL 15+ works — only `DATABASE_URL` in `.env` needs to point at it. For a
Homebrew install:

```bash
createuser -s odyssey
createdb -O odyssey restaurant
pnpm bootstrap
```

A hosted database (for example a Neon pooled connection string) also drops in unchanged;
see [Why not a vendor driver](#why-postgres-over-tcp-rather-than-a-vendor-http-driver).

---

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev:dashboard` | Expo dev server for web on :8081 |
| `pnpm dev:backend` | Wrangler dev server for the Worker on :8787 |
| `pnpm gen:contract` | **The codegen pipeline.** Emits `openapi.json`, then regenerates the Orval client |
| `pnpm db:migrate` | Applies SQL migrations from `services/backend/drizzle/` |
| `pnpm db:seed` | Truncates and reseeds demo data (deterministic) |
| `pnpm bootstrap` | `db:migrate` then `db:seed` |
| `pnpm db:generate` | Generates a new migration after editing the Drizzle schema |
| `pnpm db:studio` | Drizzle Studio, a browser UI over the database |
| `pnpm test` | All tests across the workspace |
| `pnpm typecheck` | TypeScript across every package |
| `pnpm lint` | ESLint across every package |
| `pnpm build` | Builds the Worker and the static web bundle |

### Changing the data model

```bash
# 1. edit packages/types/src/db/schema.ts
pnpm db:generate      # writes a reviewable .sql migration
pnpm db:migrate       # applies it
pnpm gen:contract     # regenerates OpenAPI + the frontend client
pnpm typecheck        # any screen now out of step fails here, not in the browser
```

---

## Repository layout

```
apps/dashboard          Expo Router app (React Native + Web)
services/backend        Hono API on Cloudflare Workers
packages/types          Drizzle schema, zod contracts, pure domain rules
packages/api-client     Orval-generated hooks + the single fetch boundary
packages/ui             Design system: tokens, theme, primitives
packages/shared         Framework-agnostic helpers (formatting)
packages/eslint-config  Shared flat ESLint config
```

### `packages/types` has three entry points, on purpose

| Import | Contains | Used by |
| --- | --- | --- |
| `@odyssey/types` | zod contracts + inferred types | backend, tooling |
| `@odyssey/types/db` | raw Drizzle tables | backend only |
| `@odyssey/types/domain` | dependency-free domain rules | **safe for the app bundle** |

`/domain` imports nothing — no drizzle, no zod. That is what lets the dashboard share the
order state machine and the pricing function with the server without pulling an ORM into
the React Native bundle.

---

## Testing

```bash
pnpm test                                  # everything
pnpm --filter @odyssey/backend test        # backend only
```

Backend tests run against a **real PostgreSQL database**, not a mock. They drive the
actual Hono app through `app.request()`, so routing, zod validation, the order state
machine, SQL constraints and the error envelope are all exercised together. Mocking the
repository layer would mostly assert that our fake behaves like our fake.

One-time setup for the test database:

```bash
createdb -O odyssey restaurant_test
# or: docker compose exec postgres createdb -U odyssey restaurant_test
```

Set `TEST_DATABASE_URL` to override its location.

---

## API

With the backend running, the generated OpenAPI document is served at
<http://localhost:8787/openapi.json> and committed at `services/backend/openapi.json`.

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/menu/full` | Categories with items nested — one request for the Menu page |
| GET/POST | `/menu/categories` | |
| PATCH/DELETE | `/menu/categories/{id}` | Delete refused (409) while the category holds items |
| GET/POST | `/menu/items` | |
| GET/PATCH/DELETE | `/menu/items/{id}` | Delete refused (409) once the item has order history |
| GET | `/customers` | Lifetime order count and spend, aggregated in SQL |
| GET/POST/PATCH | `/customers`, `/customers/{id}` | No delete: orders reference customers |
| GET | `/orders` | Filter by status (repeatable), type, customer, date range, search |
| POST | `/orders` | Server prices the order |
| GET | `/orders/{id}` | Includes items and `availableActions` |
| **POST** | **`/orders/{id}/transition`** | **The only way to change order status** |
| GET/PATCH | `/settings` | |
| GET | `/stats/overview` | Dashboard KPIs |

### Two deliberate API decisions

**Status is not a writable field.** There is no `PATCH /orders/{id}` that accepts a
status. A client asks to `accept` or `complete` an order and the server validates that
action against the state machine, refusing anything illegal with `409 INVALID_TRANSITION`
and a message listing what *is* currently permitted. The write is also a compare-and-set
against the status the server just read, so two operators acting on one order cannot both
succeed.

**Requests carry no money.** A create-order request contains menu item ids and
quantities. The server resolves current prices, applies the configured tax and service
rates, and computes every monetary field in integer cents. `expectedTotalCents` is
optional and is *verified*, never trusted — a mismatch is rejected with
`409 TOTAL_MISMATCH` rather than silently charging a different amount.

### Error envelope

Every failure returns the same shape, and the `code` is a closed enum shared with the
frontend, so UI branches on `code` and never on message text:

```json
{ "error": { "code": "ITEM_UNAVAILABLE", "message": "'Whole bream' is not currently available.",
             "details": [{ "path": "items", "message": "'Whole bream' is unavailable" }] } }
```

| Status | Meaning |
| --- | --- |
| 400 | Failed schema validation |
| 404 | Resource does not exist |
| 409 | Valid request, conflicts with current state |
| 422 | Well-formed, violates a business rule |

---

## Documentation

- [docs/architecture.md](docs/architecture.md) — the design decisions and why
- [docs/tradeoffs.md](docs/tradeoffs.md) — what is incomplete, and known limitations
- [docs/dependency-notes.md](docs/dependency-notes.md) — load-bearing version pins

The code itself is documented at the same level: every non-obvious decision has a comment
explaining *why*, not what.
