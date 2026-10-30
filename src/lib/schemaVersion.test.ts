import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { EXPECTED_SCHEMA_VERSION } from './schemaVersion'

// Resolved from this file, like the drift test in missions/missionTasks.test.ts.
const VERSION_PY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'shared', 'schemas', 'version.py')

describe.skipIf(!existsSync(VERSION_PY))('EXPECTED_SCHEMA_VERSION', () => {
  it('matches SCHEMA_VERSION in shared/schemas/version.py', () => {
    const match = /^SCHEMA_VERSION\s*=\s*"([^"]+)"/m.exec(readFileSync(VERSION_PY, 'utf8'))
    expect(match?.[1]).toBeTruthy()
    expect(EXPECTED_SCHEMA_VERSION).toBe(match![1])
  })
})
