import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { EXPECTED_SCHEMA_VERSION } from './schemaVersion'

// Resolved from this file, like the drift test in missions/missionTasks.test.ts.
// ROVERHUB_SHARED_SCHEMAS points this at another shared/schemas checkout (a
// worktree whose schema is ahead of the sibling clone); unset, it is the clone
// beside this repo.
const SHARED = process.env.ROVERHUB_SHARED_SCHEMAS
  ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'shared', 'schemas')
const VERSION_PY = path.join(SHARED, 'version.py')

describe.skipIf(!existsSync(VERSION_PY))('EXPECTED_SCHEMA_VERSION', () => {
  it('matches SCHEMA_VERSION in shared/schemas/version.py', () => {
    const match = /^SCHEMA_VERSION\s*=\s*"([^"]+)"/m.exec(readFileSync(VERSION_PY, 'utf8'))
    expect(match?.[1]).toBeTruthy()
    expect(EXPECTED_SCHEMA_VERSION).toBe(match![1])
  })
})
