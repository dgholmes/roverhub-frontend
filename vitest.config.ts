import path from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  css: { transformer: 'lightningcss' },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    // Anchored to this tree's src/. Agent worktrees live under
    // .claude/worktrees/<branch>/ and hold a full copy of src/, so the default
    // glob collected their tests too: another branch's tests running against
    // this branch's code, every shared test counted twice, and an in-progress
    // file over there able to fail the suite here -- none of it visible in the
    // output, because the test names are identical. Observed 2026-08-13, when a
    // worktree appeared mid-session and `npm test` started failing on a
    // half-written module that does not exist in this tree.
    //
    // `include` rather than `exclude`: the excluded-path form silently failed to
    // match, because the offending directory is a dotfile and the matcher does
    // not descend into those for exclusions the way it does for includes.
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
})
