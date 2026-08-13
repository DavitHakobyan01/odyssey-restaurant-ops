/**
 * Orval configuration — the final step of the contract pipeline.
 *
 *   Drizzle schema -> drizzle-zod -> Hono/OpenAPI -> openapi.json -> [Orval] -> hooks
 *
 * Everything under `src/generated/` is produced by this config and is never hand-edited.
 * `clean: true` enforces that: the directory is wiped on every run, so a manual change
 * cannot survive `pnpm gen:contract` and silently diverge from the backend.
 *
 * Regenerate with:  pnpm gen:contract
 */
import { defineConfig } from 'orval'

export default defineConfig({
  api: {
    input: {
      target: '../../services/backend/openapi.json',
    },
    output: {
      // One file per OpenAPI tag (Menu, Orders, ...) rather than a single giant module,
      // so imports in the dashboard read as `useListOrders` from the orders module and
      // tree-shaking has clean boundaries.
      mode: 'tags-split',
      target: './src/generated/endpoints',
      schemas: './src/generated/model',
      client: 'react-query',
      // Plain fetch, not axios: the same client has to run in React Native and on web,
      // and fetch is native to both.
      httpClient: 'fetch',
      clean: true,
      prettier: false,
      override: {
        mutator: {
          path: './src/http-client.ts',
          name: 'customFetch',
        },
        query: {
          // Deliberately NOT setting `useQuery` or `useMutation` here.
          //
          // Orval's default is the correct mapping — GET becomes useQuery, and
          // POST/PATCH/DELETE become useMutation. Both flags were tried and both are
          // wrong: `useMutation: true` produced useMutation hooks for GETs, and
          // `useQuery: true` produced a useQuery hook for POST /menu/categories.
          // Leaving them unset lets Orval infer from the HTTP method. Do not add them.
          //
          // Pass React Query's AbortSignal through to fetch so navigating away from a
          // screen actually cancels its in-flight requests.
          signal: true,
        },
        fetch: {
          // Generated functions return the response body directly rather than an
          // `{ data, status }` envelope unioned with every error shape.
          //
          // This is what makes the custom mutator's contract coherent: it throws
          // `ApiClientError` on a non-2xx, so a resolved promise is always a success
          // and the generated success type is accurate. With the envelope enabled,
          // hooks would be typed as `Success | Error` even though an error can never
          // reach that branch, forcing pointless narrowing at every call site.
          includeHttpResponseReturnType: false,
        },
      },
    },
  },
})
