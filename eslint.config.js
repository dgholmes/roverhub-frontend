// Deliberately conservative: rules that catch bugs (typescript-eslint's
// recommended set and React's rules of hooks), not style. Widen one rule at a
// time, fixing the code in the same change. Run: `npm run lint`.
import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  // src/legacy/ holds frozen earlier design iterations kept for comparison.
  { ignores: ['dist', 'coverage', 'src/legacy', '.claude'] },  // .claude holds git-ignored
  // scratch worktrees; linting them reports errors in code that is not in this checkout
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
      // Demo data may not leak into what an operator is told about the robot.
      //
      // The 2026-11-18 UI/UX audit found three P0s in new code that were all
      // the same mistake -- a placeholder that does not say it is one:
      //   - CameraFeedLayer rendered ./live_view.png, a stock photograph, as a
      //     live feed on up to four panes at once;
      //   - zoneContext checked missions against mock no-go polygons and badged
      //     them green "Ready";
      //   - the two map zone layers draw the mock site when given no zones.
      // Two of the three were a literal `import ... from '@/mocks'` in a
      // production module, so the type checker had nothing to object to and
      // review had to catch it by eye. Three times, it did not.
      //
      // This is the rule rather than the three patches. Everything under
      // src/mocks, and every test, is exempt below.
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['@/mocks', '@/mocks/*'],
          message:
            'Demo data must not reach production code: it renders as if it were real. '
            + 'Take the value from the data provider, or render an explicit empty/'
            + 'unknown state. If a module genuinely needs the mock provider (the '
            + 'provider swap itself), add it to the allowlist in eslint.config.js '
            + 'with the reason.',
        }],
      }],
    },
  },
  {
    // src/mocks IS the mock data, and tests are entitled to fixtures.
    files: ['src/mocks/**/*.{ts,tsx}', '**/*.test.{ts,tsx}'],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    // The six modules that may import demo data, because each one IS the
    // real/mock swap rather than leftover demo wiring. There is no debt tier
    // any more: everything else in the codebase is at `error`.
    //
    // Two different gates, and src/lib/mockBoundary.test.ts asserts that each
    // file below still uses its own -- an `off` override here is a promise,
    // that test is the check.
    //   USE_REAL_BACKEND     picks demo or real wholesale: the provider swap,
    //                        the stores' seed missions/events/sites, Org
    //                        history and members (no database, no sign-in),
    //                        and Devices' mock-only "Add robot", which is
    //                        disabled with an explanation in real mode.
    //   WIRED_COMMAND_TYPES  realDataProvider is the REAL provider and never
    //                        consults USE_REAL_BACKEND. It delegates only the
    //                        6 command types the edge executor does not
    //                        implement, tagging them `simulated: true` so the
    //                        UI can say so. Removing it would silently send
    //                        unwired commands nowhere instead of to the mock.
    //
    // The list was 13 files at the 2026-11-18 audit. Seven came off as bugs:
    //   zoneContext.ts      checked missions against the mock site's polygons
    //   NoGoZoneLayer.tsx   drew those polygons under a real robot's executed
    //   GeofenceLayer.tsx   route on the run page
    //   AnnotationLayer.tsx invented a hazard note; deleted outright, since no
    //                       annotation type, endpoint or authoring UI exists
    //   FitToRoute.tsx      framed every route preview on the mock perimeter
    //   siteExtent.ts       framed LiveOps' opening view on it too
    //   org/parts.tsx       imported a TYPE from src/mocks; the type moved to
    //                       org/orgTypes.ts, where it always belonged
    // Four of those were fixed by making a prop required and letting the type
    // checker find the callers. That is the move.
    // Tracked in docs/audit/2026-11-18-ui-ux-reaudit.md §8.6.
    files: [
      'src/lib/realtime/dataProvider.ts',
      'src/lib/realtime/realDataProvider.ts',
      'src/store/useLiveOpsStore.ts',
      'src/store/useSessionStore.ts',
      'src/org/orgData.ts',
      'src/components/org/pages/DevicesPage.tsx',
    ],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    // Tests poke at untyped JSON (locale files) and parsed Python source.
    files: ['**/*.test.{ts,tsx}'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
)
