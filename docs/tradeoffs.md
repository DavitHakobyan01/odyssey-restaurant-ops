# Tradeoffs and incomplete areas

Written plainly. Everything here is a decision I would defend, a limitation I know about,
or work I chose not to do — not something I hope goes unnoticed.

---

## Scope I deliberately cut

**No authentication or authorisation.** Not in the brief. Every endpoint is open. Adding a
real auth layer would have consumed budget the graded axes needed, and a fake one
(hardcoded token, no sessions) signals less than an honest omission. The shape of the
codebase does not resist it: auth would be a Hono middleware setting `c.var.user`, and the
service layer already takes explicit arguments rather than reading ambient state.

**No realtime.** Order status changes are not pushed. React Query refetches on window
focus and reconnect, which covers the demo — an operator returning to the tab sees the
current queue. Real push on Cloudflare Workers means Durable Objects for connection state:
a substantial amount of infrastructure for one feature, and the wrong thing to spend a
two-day budget on.

**Native is "should run", not "verified on device".** The dashboard is built entirely from
React Native primitives with no web-only APIs, `useBreakpoint()` instead of media queries,
and `react-native-svg` for icons — so it is structurally native-ready. I have not run it
on a simulator or device. Treat native as a bonus that is plausible, not as a claim.

**Responsive web is built and tested; mobile *polish* is partial.** The brief requires web
only, so phone-width was treated as a bonus rather than a target. What is verified by tests
at 375px: the sidebar becomes a bottom tab bar, the modal becomes a bottom sheet with
full-width stacked actions, page headers stack, and the data table becomes a stacked card
list. What is knowingly left rough:

- **The menu item row does not restructure at phone width.** It is the one list with no
  `sm` branch, so on a 375px screen the fixed-width price, availability switch and two
  action buttons squeeze the item name into roughly 50px and it truncates. The fix is the
  same two-line swap `Table` already performs; it was not worth the time against a
  bonus requirement.
- **No screen supplies `renderMobileRow`.** `Table` exposes it, and the Orders and CRM
  tables use `hideOnMobile` to drop their least useful columns, but the phone cards still
  use the generic label/value fallback rather than a designed mobile row.
- **Bottom sheets have no safe-area inset on native.** On a notched phone the stacked
  footer actions would sit under the home indicator. `AppShell` handles this for the tab
  bar; `Modal` and `Toast` do not. Web is unaffected.

**No image upload.** `menu_items.imageUrl` is a URL column with no upload pipeline (R2 +
signed URLs would be the natural fit). Seeded items have no images.

**Opening hours are read-only in the UI.** The backend fully supports editing them —
`PATCH /settings` validates the array, rejects a duplicate weekday with a 400, and
enforces `opensAt < closesAt` on open days — and the Settings screen renders the current
schedule. What is missing is the editor: seven rows of paired time inputs with
client-side validation mirroring the server's. It was the lowest-value remaining surface
per unit of time, so it lost to finishing the order-creation flow. The API contract for it
is done and tested.

**Order creation picks an existing customer only.** The API accepts a discriminated union
— `{ mode: 'existing', customerId }` or `{ mode: 'new', name, email, phone? }` — and the
`mode: 'new'` path is exercised by the backend test suite, including the case-insensitive
reuse of an existing email. The modal currently exposes only the `existing` branch, with a
separate "Add customer" flow in CRM. Wiring the inline branch is a small change to one
form, not a change to the contract.

---

## Known limitations

### One database connection per request

A Postgres connection is not safe to share across concurrent requests inside a Worker
isolate, so `db/client.ts` opens a client per request and closes it in a `finally`. That
is one TCP connect and one TLS handshake per API call.

This is the honest cost of choosing a portable driver over a vendor HTTP one. The
production fix requires no code change: put Cloudflare Hyperdrive (or PgBouncer) in front
of Postgres and point `DATABASE_URL` at it. I did not do it because it needs a Cloudflare
account with Hyperdrive provisioned, which would make the project harder to review
locally — the opposite of the goal.

### `::int` casts bound aggregate ranges

`count(...)::int` and `coalesce(sum(...), 0)::int` in the CRM and stats queries exist
because postgres-js returns `bigint` as a **string**, which would fail the
`z.number().int()` contract at runtime. The cast bounds lifetime spend per customer at
about $21.4M. `::bigint` would reintroduce the string-over-the-wire problem the cast
exists to solve; the correct long-term fix is a driver-level bigint parser, not a wider
cast.

### OpenAPI component naming degrades under Vitest

`@hono/zod-openapi` adds `.openapi()` to zod's prototype when imported. Vitest builds its
own module graph and can hand the test process a zod instance that was never patched (the
patch is idempotent-guarded, so re-applying it does not help). Rather than let this crash
the whole suite, `openapi/registry.ts` wraps naming in a `named()` helper that passes the
schema through unnamed when the extension is absent.

Component names are document metadata — they do not affect validation, routing or any
behaviour under test. **The shipped `openapi.json` is generated by `pnpm gen:contract`
under `tsx`, where all 23 components are properly named** (verified: 23 named schemas, 90
`$ref` usages). I spent time trying `resolve.dedupe`, an explicit alias to the resolved
zod path, and `ssr.noExternal` before concluding this was the pragmatic boundary.

### Pagination is offset-based

`LIMIT`/`OFFSET` with a stable tiebreaker on `id`. Correct and simple at this data volume.
Deep offsets degrade on large tables; keyset pagination would be the fix, at the cost of a
more complex client contract. Not worth it for an order list an operator actually reads.

### The seed truncates

`pnpm db:seed` clears every table before inserting. That is the right behaviour for a
reviewable demo (deterministic, repeatable, byte-identical every run) and the wrong
behaviour for anything resembling production. It is not wired into any deploy path.

---

## Decisions worth arguing about

**Drizzle schema lives in `packages/types`, not in the backend.** The tables *are* the
contract source that drizzle-zod derives from, so they belong with the contracts.
Migration lifecycle (generate/apply/seed) stays in `services/backend`, the only process
that talks to the database. A reviewer expecting the schema under `services/backend`
may find this surprising; I think the dependency direction justifies it.

**`packages/types` has three entry points** (`.`, `/db`, `/domain`). This is more
ceremony than a single barrel, and it exists for one concrete reason: `/domain` has zero
dependencies, so the dashboard can share the state machine and the pricing function
without pulling drizzle into the React Native bundle.

**Inline customer creation reuses an existing email rather than erroring.** Placing an
order for `mode: 'new'` with an email that already exists returns the existing customer.
The alternative — a 409 — is arguably more correct, but fragmenting one person's order
history across duplicate records is worse for the CRM, which is the feature that history
feeds.

**Cancelled orders are excluded from revenue but included in `ordersByStatus`.** A
cancelled order is not revenue, but operators need to see cancellations. This asymmetry is
intentional and documented in the endpoint description; a reviewer skimming the numbers
might otherwise think the counts do not reconcile.

**`BELOW_MINIMUM` is checked before `TOTAL_MISMATCH`.** An order under the minimum is
rejected before its total is compared against the client's expectation. Either order is
defensible; this one avoids reporting a pricing disagreement about an order that was never
going to be accepted.

---

## What I would do next, in order

1. **Hyperdrive in front of Postgres** — removes the per-request connect, no code change.
2. **Auth + roles** — an operator should not be able to change tax rates; a manager should.
3. **Optimistic updates on transitions** — the status action already returns the full
   order, so the cache update is trivial; it just needs `onMutate` rollback handling.
4. **A contract test that validates responses against the zod schemas** — the schemas
   exist and the mappers already produce exactly-conformant objects, so this is cheap
   insurance against a mapper regression.
5. **Broader frontend test coverage** — currently focused on the pieces with real logic
   rather than on snapshotting every screen.
