import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// The mock/real boundary, as a test rather than only as a lint rule.
//
// eslint's no-restricted-imports stops a NEW production module reaching into
// @/mocks. It cannot say anything about the handful that legitimately do, and
// an `off` override is just a promise in a config file. This is the part that
// has to stay true: a production module may import demo data only if it
// switches on USE_REAL_BACKEND, so the demo data cannot reach an operator
// looking at a real robot.
//
// Four modules qualify, and each is the real/mock swap itself rather than
// leftover demo wiring. Everything else that used to be on the list was a bug
// and was fixed: zoneContext checked missions against mock polygons, the zone
// layers drew them under a real robot's executed route, AnnotationLayer
// invented a hazard note, FitToRoute and siteExtent framed every view on the
// mock perimeter. Audit 2026-11-18 §4.2 / §8.6.

const SRC = fileURLToPath(new URL('..', import.meta.url))

/**
 * Modules allowed to import demo data, and the gate each uses to keep it away
 * from an operator looking at a real robot. Shrink this; do not grow it.
 *
 * Two different gates, and the difference is worth keeping straight:
 *   USE_REAL_BACKEND     picks demo or real wholesale — the provider swap, the
 *                        stores' seed data, Org content that has no backend,
 *                        and Devices' mock-only "Add robot" (disabled with an
 *                        explanation in real mode).
 *   WIRED_COMMAND_TYPES  realDataProvider IS the real provider and never
 *                        consults USE_REAL_BACKEND. It delegates only the six
 *                        command types the edge executor does not implement,
 *                        tagging those outcomes `simulated: true` so the UI
 *                        can say so.
 */
const GATED: Record<string, RegExp> = {
  'lib/realtime/dataProvider.ts': /USE_REAL_BACKEND/,
  'lib/realtime/realDataProvider.ts': /WIRED_COMMAND_TYPES/,
  'store/useLiveOpsStore.ts': /USE_REAL_BACKEND/,
  'store/useSessionStore.ts': /USE_REAL_BACKEND/,
  'org/orgData.ts': /USE_REAL_BACKEND/,
  'components/org/pages/DevicesPage.tsx': /USE_REAL_BACKEND/,
}
const gatedPaths = Object.keys(GATED).map((p) => p.split('/').join(sep))

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      if (name === 'mocks' || name === 'legacy') continue
      sourceFiles(full, out)
    } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      out.push(full)
    }
  }
  return out
}

const importsMocks = (file: string) =>
  /from\s+['"]@\/mocks/.test(readFileSync(file, 'utf8'))

describe('the mock/real boundary', () => {
  const offenders = sourceFiles(SRC).filter(importsMocks).map((f) => relative(SRC, f))

  it('is crossed only by modules that are the real/mock swap', () => {
    expect([...offenders].sort()).toEqual([...gatedPaths].sort())
  })

  it.each(Object.entries(GATED))('%s gates its demo data', (file, gate) => {
    // Not a style check: this is the thing that keeps demo data away from an
    // operator looking at a real robot. A module that imports from @/mocks and
    // never consults its gate is feeding the mock to everyone.
    expect(readFileSync(join(SRC, file.split('/').join(sep)), 'utf8')).toMatch(gate)
  })
})
