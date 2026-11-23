import { describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/realtime/apiError'
import {
  checkThresholdText, checkValueText, errorText, freezeRefusalOf, hasTrackHeader, newSurveyMapId, slug, stageKey, surveyProblem,
} from './mapPipeline'

describe('freezeRefusalOf', () => {
  it('reads the quality gate 409s and nothing else', () => {
    const gate = (code: string) => new ApiError(409, { detail: { code, message: 'why' } }, 'x')
    expect(freezeRefusalOf(gate('quality_missing'))).toEqual({ code: 'quality_missing', message: 'why', failed: [] })
    expect(freezeRefusalOf(gate('quality_stale'))?.code).toBe('quality_stale')
    expect(freezeRefusalOf(gate('zones_unreviewed'))?.code).toBe('zones_unreviewed')
    expect(freezeRefusalOf(gate('something_else'))).toBeNull()
    expect(freezeRefusalOf(new ApiError(409, { detail: 'a sentence' }, 'x'))).toBeNull()
    expect(freezeRefusalOf(new ApiError(400, { detail: { code: 'quality_failed' } }, 'x'))).toBeNull()
    expect(freezeRefusalOf(new Error('no'))).toBeNull()
  })

  it('errorText prefers the server sentence, then the gate message', () => {
    expect(errorText(new ApiError(400, { detail: 'name is required' }, 'POST answered 400'))).toBe('name is required')
    expect(errorText(new ApiError(409, { detail: { code: 'quality_stale', message: 'run it again' } }, 'x'))).toBe('run it again')
    expect(errorText(new Error('boom'))).toBe('boom')
  })
})

describe('check figures', () => {
  it('words each value in its unit', () => {
    expect(checkValueText({ id: 'floor_tilt_deg', value: 4.84 })).toBe('4.84°')
    expect(checkValueText({ id: 'track_drift_p95_m', value: 0.0384 })).toBe('3.8 cm')
    expect(checkValueText({ id: 'free_area_m2', value: 412.4 })).toBe('412 m²')
    expect(checkValueText({ id: 'free_area_m2', value: 4.5 })).toBe('4.5 m²')
    expect(checkValueText({ id: 'path_coverage', value: 0.9712 })).toBe('97.1 %')
    expect(checkValueText({ id: 'track_inside_grid', value: 1 })).toBe('100 %')
    expect(checkValueText({ id: 'track_breaks', value: 2 })).toBe('2')
    expect(checkValueText({ id: 'planning_grid', value: true })).toBeNull()
    expect(checkValueText({ id: 'replay', value: null })).toBeNull()
  })

  it('words each limit with its direction', () => {
    expect(checkThresholdText({ id: 'floor_tilt_deg', comparison: 'max', threshold: 1 })).toBe('≤ 1.00°')
    expect(checkThresholdText({ id: 'path_coverage', comparison: 'min', threshold: 0.95 })).toBe('≥ 95 %')
    expect(checkThresholdText({ id: 'track_breaks', comparison: 'max', threshold: 0 })).toBe('≤ 0')
    expect(checkThresholdText({ id: 'surveyed_fraction', comparison: 'info', threshold: null })).toBeNull()
  })

  it('maps every stage the backend writes, and no others', () => {
    for (const s of ['queued', 'started', 'reading the cloud', 'levelling', 'building the grid', 'storing', 'checking quality', 'done']) {
      expect(stageKey(s)).not.toBeNull()
    }
    expect(stageKey('something new')).toBeNull()
  })
})

describe('a new survey', () => {
  it('slugs a name as maps/survey.py does', () => {
    expect(slug('Office, Level 1!')).toBe('office-level-1')
    expect(slug('사무실')).toBe('map')
  })

  it('makes a map id that is valid on the backend and never one already taken', () => {
    const id = newSurveyMapId('Office L1', 1_763_270_000_000)
    expect(id).toMatch(/^map-office-l1-[a-z0-9]{1,6}$/)
    expect(id).toMatch(/^[A-Za-z0-9](?:[A-Za-z0-9_.-]{0,126}[A-Za-z0-9_-])?$/)  // store.MAP_ID_RE
    expect(newSurveyMapId('Office L1', 1_763_270_000_001)).not.toBe(id)
    expect(newSurveyMapId('x'.repeat(300)).length).toBeLessThanOrEqual(128)
  })

  it('checks the files before sending them', async () => {
    const pcd = new File(['x'], 'scan.pcd')
    const track = new File(['t,x,y,z\n0,0,0,0'], 't.csv')
    expect(await surveyProblem({ name: ' ', cloud: pcd, track })).toBe('nameMissing')
    expect(await surveyProblem({ name: 'a', cloud: null, track })).toBe('cloudMissing')
    expect(await surveyProblem({ name: 'a', cloud: new File(['x'], 'scan.ply'), track })).toBe('cloudNotPcd')
    expect(await surveyProblem({ name: 'a', cloud: pcd, track: null })).toBe('trackMissing')
    expect(await surveyProblem({ name: 'a', cloud: pcd, track: new File(['x,y\n'], 't.csv') })).toBe('trackHeader')
    expect(await surveyProblem({ name: 'a', cloud: pcd, track })).toBeNull()
  })

  it('accepts the header with spaces, in any case, with CRLF line ends', async () => {
    expect(await hasTrackHeader(new Blob([' T, X ,y,z\r\n1,2,3,4']))).toBe(true)
    expect(await hasTrackHeader(new Blob(['﻿t,x,y,z\n']))).toBe(true)
    expect(await hasTrackHeader(new Blob(['t,x,y\n']))).toBe(false)
  })
})
