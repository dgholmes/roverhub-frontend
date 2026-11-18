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
    // Architectural: these two ARE the real/mock swap. dataProvider.ts chooses
    // between the two implementations on VITE_USE_REAL_BACKEND, and
    // realDataProvider delegates the 6 command types outside
    // WIRED_COMMAND_TYPES to the mock, tagging those outcomes `simulated: true`
    // so the UI says so. Removing either would silently send unwired commands
    // nowhere instead of to the mock. Documented in CLAUDE.md under Frontend
    // Architecture. These are permanent, not debt.
    files: ['src/lib/realtime/dataProvider.ts', 'src/lib/realtime/realDataProvider.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    // ⚠️ Debt, not architecture. Each of these reaches into the mock site for
    // geometry or seed data that a real deployment has no equivalent of, and
    // each is a §4.2-shaped bug waiting to be reported: the zone layers draw
    // the mock site's polygons whenever `zones` is undefined, which is still
    // three call sites (RunPage, SnapshotMap, RoutePreviewMap). This list is
    // meant to shrink and must never grow -- it was 13 files when the audit
    // was written and zoneContext.ts came off it the same day.
    // Tracked in docs/audit/2026-11-18-ui-ux-reaudit.md §8.6.
    files: [
      'src/components/liveops/map/AnnotationLayer.tsx',
      'src/components/liveops/map/GeofenceLayer.tsx',
      'src/components/liveops/map/NoGoZoneLayer.tsx',
      'src/components/missions/route-editor/FitToRoute.tsx',
      'src/components/org/pages/DevicesPage.tsx',
      'src/components/org/parts.tsx',
      'src/liveops/siteExtent.ts',
      'src/org/orgData.ts',
      'src/store/useLiveOpsStore.ts',
      'src/store/useSessionStore.ts',
    ],
    rules: { 'no-restricted-imports': 'warn' },
  },
  {
    // Tests poke at untyped JSON (locale files) and parsed Python source.
    files: ['**/*.test.{ts,tsx}'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
)
