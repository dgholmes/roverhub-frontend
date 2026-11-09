import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import {
  DETECTOR_STATUSES, INCIDENT_SEVERITIES, INCIDENT_STATES, SOURCE_STATES,
  type Detection, type DetectorInfo, type Incident, type PerceptionStatus,
} from '@/types'

// The perception wire types against shared/schemas/detection.py, the same way
// src/missions/missionTasks.test.ts guards the mission types. Skips (with a
// loud warning) only when shared/ is not checked out beside the frontend.
const SHARED = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'shared', 'schemas')
const SOURCE = path.join(SHARED, 'detection.py')
const haveShared = existsSync(SOURCE)
if (!haveShared) console.warn(`\n!!! perception drift test did NOT run: ${SOURCE} not found\n`)

it.runIf(!haveShared && !!process.env.CI)('has shared/schemas/detection.py, because CI must not skip the drift test', () => {
  throw new Error(`perception drift test cannot run: ${SOURCE} not found`)
})

function pythonLiteral(source: string, name: string): string[] {
  const m = new RegExp(`^${name} = Literal\\[([^\\]]*)\\]`, 'm').exec(source.replace(/#.*$/gm, ''))
  if (!m) throw new Error(`no Literal ${name} in the schema`)
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1])
}

function pythonFields(source: string, cls: string): string[] {
  const start = source.search(new RegExp(`^class ${cls}\\(`, 'm'))
  if (start < 0) throw new Error(`no class ${cls} in the schema`)
  const rest = source.slice(start).split(/\r?\n/).slice(1)
  const end = rest.findIndex((l) => /^\S/.test(l))
  const body = end < 0 ? rest : rest.slice(0, end)
  return body.map((l) => /^ {4}([a-z_]\w*):/.exec(l)?.[1]).filter((f): f is string => !!f)
}

const sorted = (xs: readonly string[]) => [...xs].sort()

// Typed fixtures: the compiler checks they are complete TS objects, and the
// tests below check their keys against the Python classes.
const detection: Required<Detection> = {
  label: 'person', confidence: 0.9, bbox: [0, 0, 0.1, 0.2], camera: 'front', model: 'dfine_s',
  detector_id: 'base.person', track_id: 't1', keypoints: [[0.1, 0.1, 0.9]], frame_ts: '2026-11-09T00:00:00Z',
}
const detector: Required<DetectorInfo> = {
  detector_id: 'base.person', kind: 'model', version: 'dfine_s.onnx', labels: ['person'],
  status: 'running', fps: 9.8, reason: null,
}
const status: Required<PerceptionStatus> = {
  robot_id: 'r', site_id: 's', at: 't', camera: 'front', source_state: 'live', fps: 9.8, detectors: [detector],
}
const incident: Required<Incident> = {
  incident_id: 'r-1', robot_id: 'r', site_id: 's', rule_id: 'builtin.fall_alert', label: 'fallen_person',
  severity: 'critical', opened_at: 't', camera: 'front', detections: [detection],
  evidence_snapshot_ids: [], evidence_pending: false, state: 'open', message: 'm',
}

describe.skipIf(!haveShared)('perception types match shared/schemas/detection.py', () => {
  const py = haveShared ? readFileSync(SOURCE, 'utf8') : ''

  it.each([
    ['Detection', detection],
    ['DetectorInfo', detector],
    ['PerceptionStatus', status],
    ['Incident', incident],
  ] as const)('%s has the same fields', (cls, fixture) => {
    expect(sorted(Object.keys(fixture))).toEqual(sorted(pythonFields(py, cls)))
  })

  it.each([
    ['DetectorStatus', DETECTOR_STATUSES],
    ['SourceState', SOURCE_STATES],
    ['IncidentState', INCIDENT_STATES],
    ['IncidentSeverity', INCIDENT_SEVERITIES],
  ] as const)('%s has the same members', (name, members) => {
    expect(sorted(members)).toEqual(sorted(pythonLiteral(py, name)))
  })
})
