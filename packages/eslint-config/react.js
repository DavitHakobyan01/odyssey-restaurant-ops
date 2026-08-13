import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

import base from './base.js'

/** Flat config for the React Native / web packages. */
export default [
  ...base,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  },
]
