/**
 * Frontend test configuration.
 *
 * The dashboard is written in React Native primitives but its required target is web, so
 * tests run the components through **react-native-web in jsdom** rather than through a
 * native test renderer. Two reasons:
 *
 *  1. It tests what actually ships. The reviewer opens this in a browser; asserting on
 *     the react-native-web output is asserting on the real artifact.
 *  2. It keeps one test runner (vitest) across the entire monorepo. The alternative,
 *     jest-expo, would mean a second toolchain, a second config format and a second set
 *     of transform rules for the sake of one package.
 *
 * The `react-native` -> `react-native-web` alias is what makes it work: every component
 * imports from 'react-native', and the alias resolves that to the web implementation the
 * browser build also uses.
 */
import { createRequire } from 'node:module'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const require = createRequire(import.meta.url)

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      // The whole trick: components import 'react-native', tests get 'react-native-web'.
      { find: /^react-native$/, replacement: require.resolve('react-native-web') },
    ],
    // Workspace packages ship TypeScript source, so a single React instance matters —
    // two copies would break hooks with the classic "invalid hook call".
    dedupe: ['react', 'react-dom', 'react-native-web'],
  },
  define: {
    // react-native-web branches on __DEV__; without it, components throw on import.
    __DEV__: 'true',
  },
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./tests/setup.ts'],
    include: ['**/*.test.ts', '**/*.test.tsx'],
    exclude: ['node_modules', 'dist', '.expo'],
    server: {
      /**
       * Workspace packages ship TypeScript source and must go through Vite's transform.
       *
       * `react-native-svg` is here for a different reason: it publishes untranspiled
       * source, so Node cannot parse it directly and any screen importing an icon fails to
       * load with `SyntaxError: Unexpected token 'typeof'`. Inlining routes it through
       * Vite's transform like first-party code.
       */
      deps: { inline: [/^@odyssey\//, /react-native-web/, /react-native-svg/] },
    },
  },
})
