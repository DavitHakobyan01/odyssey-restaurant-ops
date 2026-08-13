import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import tseslint from 'typescript-eslint'
import globals from 'globals'

/** Shared flat config for every package in the workspace. */
export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.es2022 },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      // Generated artifacts are never hand-edited, so they are not linted either.
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    ignores: [
      '**/dist/**',
      '**/.turbo/**',
      '**/.expo/**',
      '**/.wrangler/**',
      '**/node_modules/**',
      // Orval output — regenerate, never edit.
      '**/src/generated/**',
      '**/drizzle/**',
    ],
  },
)
