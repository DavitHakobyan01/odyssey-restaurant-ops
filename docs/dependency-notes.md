# Dependency pinning notes

Three `pnpm.overrides` in the root `package.json` are load-bearing. They are not
cosmetic version bumps — each one prevents a specific, hard-to-debug failure.

## `zod: 4.4.3`

`@hono/zod-openapi` registers `.openapi()` by extending zod's schema prototype.
`drizzle-zod` builds its schemas from its *own* zod import.

If pnpm resolves two different zod copies into the store, the prototype extension is
applied to one copy and the drizzle-derived schemas come from the other. The failure
mode is nasty: everything type-checks, `.openapi()` is silently missing on generated
schemas, and the OpenAPI document comes out with empty or malformed component schemas —
which then propagates into wrong Orval output.

Pinning one exact version guarantees a single instance, so the whole
`drizzle-zod -> Hono/OpenAPI -> Orval` chain operates on the same schema objects.

Peer ranges confirmed at pin time:

- `drizzle-zod@0.8.3` -> `zod: ^3.25.0 || ^4.0.0`
- `@hono/zod-openapi@1.5.2` -> `zod: ^4.0.0`

The overlap is Zod 4, which is what the workspace uses.

## `@react-native/metro-config: 0.86.2`

`react-native@0.86.2` requires the exactly-matching `@react-native/metro-config`.
A transitive dependency pulled in `0.87.0`, which mismatches the bundler's expected
serialiser options and breaks web bundling in non-obvious ways. Pinned to the version
React Native itself asks for.

## `react-native-worklets: 0.10.1`

`expo-modules-core@57.0.10` declares `react-native-worklets: ^0.7.4 || ^0.8.0 || ^0.9.0 || ^0.10.0`.
A transitive `0.11.4` falls outside that range. Pinned into the supported range.

## Node version

Expo SDK 57 / React Native 0.86.2 declare
`node: ^20.19.4 || ^22.13.0 || ^24.3.0 || >= 25.0.0`.

Node 25 is explicitly supported — verified locally with `expo-doctor` (20/20 checks
passing), a served web dev bundle, and a successful `expo export --platform web`.
The commonly-repeated "Expo requires Node 20/22 LTS" advice is out of date for SDK 57.

## Why Postgres over TCP rather than a vendor HTTP driver

The Worker uses `postgres-js` with the `nodejs_compat` compatibility flag rather than
`@neondatabase/serverless`. This keeps the data layer vendor-neutral: the identical code
path runs against a local Docker/Homebrew Postgres and against any hosted Postgres
(including a Neon pooled connection string) by changing only `DATABASE_URL`.

Verified working inside real `workerd` via `wrangler dev`. `fetch_types: false` is set on
the client because postgres-js otherwise performs a type-introspection round trip on
every cold connection, which is wasted latency in a serverless request lifecycle.
