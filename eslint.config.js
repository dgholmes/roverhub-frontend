// Deliberately conservative: rules that catch bugs (typescript-eslint's
// recommended set and React's rules of hooks), not style. Widen one rule at a
// time, fixing the code in the same change. Run: `npm run lint`.
import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  // src/legacy/ holds frozen earlier design iterations kept for comparison.
  { ignores: ['dist', 'coverage', 'src/legacy'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: { ecmaVersion: 2022, globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // A leading underscore is this codebase's "deliberately unused" marker
      // (mock stubs matching an interface, rest-destructuring to drop a key).
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_',
      }],
    },
  },
  {
    // Tests poke at untyped JSON (locale files) and parsed Python source.
    files: ['**/*.test.{ts,tsx}'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
)
