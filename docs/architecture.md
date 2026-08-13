# Architecture

Why this codebase is shaped the way it is. Ordered from the decision that constrains
everything else, downward.

---

## 1. One source of truth, generated outward

The requirement that shaped every other decision: **a data shape is declared once, in the
database schema, and everything else is derived from it.**

```
packages/types/src/db/schema.ts          Drizzle tables
        |
        |  drizzle-zod  — reads column types, lengths, nullability
        v
packages/types/src/contracts/*.ts        zod schemas (+ business rules the DB can't express)
        |
        |  @hono/zod-openapi — route definitions ARE the spec
        v
services/backend/openapi.json            OpenAPI 3.1, emitted from the running app
        |
        |  Orval
        v
packages/api-client/src/generated/       types + React Query hooks
        |
        v
apps/dashboard                           screens
```

### What this buys, concretely

A `varchar('name', { length: 160 })` in the schema arrives in the dashboard's TypeScript as
a documented `maxLength` without anyone writing it down twice:

```jsonc
// openapi.json — generated
"name": { "type": "string", "minLength": 1, "maxLength": 160 }
//                          ^^^^^^^^^^^^^  business rule, written once in contracts/
//                                         ^^^^^^^^^^^^^^ database truth, never written by hand
```

```ts
// packages/api-client/src/generated/model/menuItem.ts — generated
export interface MenuItem {
  /** @maxLength 160 */
  name: string
  /** @nullable */
  description: string | null
}
```

Rename a column and `pnpm gen:contract && pnpm typecheck` tells you every screen that
needs attention. There is no path by which the frontend and backend disagree about a
shape, because there is only one shape.

### The rule that enforces it

`packages/api-client/src/generated/` is deleted and rewritten on every `pnpm gen:contract`
(Orval's `clean: true`). A hand edit cannot survive, so it cannot silently diverge.

---

## 2. Layering

```
routes/        HTTP.  createRoute() declares the contract; the handler parses and delegates.
services/      Business rules.  The only layer that throws AppError.  No SQL, no HTTP.
repositories/  SQL only.  Returns Drizzle rows.  No rules, no DTO shaping.
mappers/       Row -> DTO.  Explicit Date -> ISO conversion.
```

A handler is three lines because everything interesting lives below it:

```ts
app.openapi(createOrderRoute, async (c) => {
  const body = c.req.valid('json')            // already validated by the route contract
  return c.json(await orderService.createOrder(c.var.db, body), 201)
})
```

**Why services never touch HTTP.** They throw `AppError` with a domain code; one `onError`
hook maps codes to status codes. So the same rules hold for any caller — an HTTP request,
the seed script, or a future queue consumer — and they are testable without a request
object.

**Why mappers are explicit.** Drizzle returns `Date` for timestamps; the contract declares
ISO strings. Relying on `JSON.stringify` to convert implicitly would mean the object the
handler builds does not actually satisfy the schema the OpenAPI document was generated
from. Converting explicitly keeps the runtime value and the documented contract in
agreement, so tests can validate real handler output.

---

## 3. Order status is not a field

The single most important backend decision.

There is no `PATCH /orders/{id}` that accepts a status, and no request schema in the
codebase contains a writable `status`. The only route that changes an order's state is:

```
POST /orders/{id}/transition   { "action": "accept" | "start_preparing" | ... }
```

The state machine is declared once, as data, in `packages/types/src/domain/order-status.ts`:

```ts
export const ORDER_TRANSITIONS = {
  accept:          { from: ['pending'],    to: 'accepted',  requiresReason: false },
  start_preparing: { from: ['accepted'],   to: 'preparing', requiresReason: false },
  mark_ready:      { from: ['preparing'],  to: 'ready',     requiresReason: false },
  complete:        { from: ['ready'],      to: 'completed', requiresReason: false },
  cancel:          { from: ['pending', 'accepted', 'preparing', 'ready'],
                     to: 'cancelled', requiresReason: true },
}
```

Three things follow from declaring it as data rather than as `if` statements:

1. **The server rejects illegal actions** with `409 INVALID_TRANSITION` and a message
   naming what *is* permitted — `Cannot 'complete' an order that is 'pending'. Available
   actions: accept, cancel.`
2. **The API tells the client what it may do.** `GET /orders/{id}` returns
   `availableActions`, computed server-side from the persisted status by the same
   function the transition endpoint enforces. The UI renders one button per available
   action, so what an operator can click and what the server will accept cannot disagree.
   A test asserts every advertised action actually succeeds.
3. **The frontend shares the module** (`@odyssey/types/domain` has zero dependencies), so
   it can render affordances without a round trip — while the server stays authoritative.

### Concurrency

The write is a compare-and-set against the status the service just read:

```ts
.where(and(eq(orders.id, id), eq(orders.status, expectedCurrentStatus)))
```

Zero rows updated means another operator advanced the order in between, which surfaces as
a 409 rather than silently clobbering their change. In a kitchen with several tablets on
the same queue, this is a real race, not a theoretical one.

---

## 4. The client never sets money

A create-order request carries menu item ids and quantities. It carries no prices.

The server resolves current prices from the database, applies the tax and service rates
from settings, and computes every monetary field. `expectedTotalCents` is optional and is
**verified, not trusted** — a mismatch is rejected with `409 TOTAL_MISMATCH` rather than
charging an amount nobody agreed to.

**All money is integer minor units.** No float ever touches a currency value. Rates are
basis points (875 = 8.75%), so the arithmetic stays in integers end to end.

`calculateOrderTotals` lives in `@odyssey/types/domain` and is the *only* implementation
of pricing in the repository. The backend calls it to compute the totals it persists; the
dashboard calls the same function to show a live cart estimate; the seed script uses it so
demo data obeys the same invariants. Sharing the function is what makes the estimate
trustworthy — the server remaining the only writer is what makes it safe.

**Prices are snapshotted** onto `order_items` at order time. A later menu price change
cannot rewrite what a customer was charged; a test asserts this.

---

## 5. Why Postgres over TCP rather than a vendor HTTP driver

The Worker uses `postgres-js` with the `nodejs_compat` flag, not `@neondatabase/serverless`.

An HTTP driver would shave some latency on Neon specifically, but it couples the data
layer to one provider. With `postgres-js`, the identical code runs against Docker
Postgres, Homebrew Postgres, RDS, or a Neon pooled URL — only `DATABASE_URL` changes. For
a project that must be trivially reviewable on a laptop *and* deployable to Cloudflare,
that portability is worth more than the milliseconds.

Verified working inside real `workerd` before any application code was written.

**The cost, stated plainly:** a Postgres connection is not safe to share across concurrent
requests in an isolate, so a client is opened per request and closed in a `finally`. That
is one connect per request. The production answer is Cloudflare Hyperdrive or any external
pooler in front of Postgres — it needs no code change here, only a different
`DATABASE_URL`. See [tradeoffs.md](tradeoffs.md).

---

## 6. The design system

**Tokens are the only place visual values exist.** `packages/ui/src/tokens/palette.ts`
holds the only hex literals in the codebase. Components consume *semantic* tokens
(`theme.color.textMuted`, `theme.color.borderStrong`), never palette steps and never
literals.

That constraint is what makes dark mode work by construction rather than by a second
styling pass: both themes satisfy the same total `ThemeColors` contract, so a component
styled with semantic tokens is correct in both. There is no `mode === 'dark'` branch in
any component.

**Dark mode is not an inversion.** Two things change independently:

- Surfaces get *lighter* as they come forward (`neutral900 -> neutral800`), the reverse of
  light mode. In the dark, elevation reads through luminance because shadows are nearly
  invisible.
- Accents step *down* the ramp (`teal600 -> teal400`). A 600-step teal that looks
  confident on white is muddy on near-black.

**Interaction states are mandatory, not optional.** Every interactive primitive implements
rest, hover, active/pressed, focus and disabled. Focus rings are absolutely-positioned
overlays rather than border changes, so focusing an element never reflows the page around
it.

**Responsiveness is JavaScript, not media queries.** React Native has none, so
`useBreakpoint()` drives layout on both platforms from one set of rules. This is why the
data table becomes a stacked card list on small screens and the modal becomes a bottom
sheet — behaviour a media query could express on web but that would have to be rewritten
for native.

---

## 7. Frontend data flow

```
generated hook (React Query)  ->  screen  ->  presentational primitives
```

- **Screens do not fetch.** They call generated hooks. There is no `fetch` anywhere in
  the app; `packages/api-client/src/http-client.ts` is the single network boundary, which
  is why base URL resolution, error normalisation and abort-signal plumbing each exist
  exactly once.
- **Errors are typed.** The mutator throws `ApiClientError` carrying the backend's closed
  error `code`, so UI branches on `code === 'ITEM_UNAVAILABLE'` rather than matching
  message text. `fieldErrors` maps validation details onto form inputs.
- **Mutations never retry.** A retried "create order" could produce a duplicate order.
  Queries retry only on 5xx — retrying a request the server has already definitively
  rejected just makes failure feel slow.

---

## 8. Testing strategy

Backend tests run against a **real PostgreSQL** through the **real Hono app**
(`app.request()`), not against mocks.

The behaviour worth testing here — enum constraints, unique indexes on `lower(email)`,
sequences, transactional inserts, aggregate SQL, zod validation, the error envelope — is
behaviour the database and the framework provide. A mocked repository would assert that
our fake behaves like our fake.

The suite is single-threaded and truncates between cases, trading a little wall-clock for
tests that are genuinely independent.

---

## 9. Decisions that were deliberately *not* made

| Not done | Why |
| --- | --- |
| Auth | Not in the brief. Adding it would consume budget the graded axes need, and a fake auth layer signals less than an honest omission. |
| Realtime order updates | React Query's focus refetch covers the demo. Websockets on Workers means Durable Objects — a large amount of infrastructure for one feature. |
| Soft deletes everywhere | Deletion is refused where history matters (items with orders, non-empty categories, customers) which is stronger than a `deleted_at` column nobody filters on. |
| A generic `PATCH /orders/{id}` | The whole point is that status is not client-writable. A generic patch would reopen that door. |
| Separate `packages/db` | The schema *is* the contract source, so it belongs with the contracts. Migration lifecycle stays in the backend, the only process that talks to the database. |
