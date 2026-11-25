import { describe, expect, it } from 'vitest'
import { initialRobots } from '@/mocks/mockRobots'
import type { DetectorInfo, PerceptionStatus, RobotState } from '@/types'
import {
  DETECTION_SCHEMA, checkboxParams, detectionButton, detectionMenu, detectionView, detectorRows, selectionOf,
  switchParams, toggleDetector, withNeeds, type DetectionSetting,
} from './detection'

const info = (detector_id: string, over: Partial<DetectorInfo> = {}): DetectorInfo => ({
  detector_id, kind: detector_id === 'base.fall' ? 'derived' : 'model', version: 'v', labels: ['person'],
  status: 'running', fps: 9.8, reason: null, ...over,
})

/** What perception publishes (pipeline.build_status / off_status, 0.0.31). */
const status = (over: Partial<PerceptionStatus> = {}): PerceptionStatus => ({
  robot_id: 'r', site_id: 's', at: 't', camera: 'front', source_state: 'live', fps: 9.8,
  detectors: [info('base.person'), info('base.pose'), info('base.fall')],
  enabled: true, selected: ['base.person', 'base.pose', 'base.fall'], off_reason: null,
  ...over,
})
const offStatus = (reason: 'switched_off' | 'survey', enabled: boolean, selected: string[]): PerceptionStatus => status({
  source_state: 'unavailable', fps: null, enabled, selected, off_reason: reason,
  detectors: ['base.person', 'base.pose', 'base.fall'].map((id) => info(id, { status: 'unavailable', fps: null, reason: 'switched off' })),
})

const ALL = ['base.person', 'base.pose', 'base.fall'] as const

describe('withNeeds', () => {
  it('brings what each detector needs, in the order a status lists them', () => {
    expect(withNeeds(['base.fall'])).toEqual([...ALL])
    expect(withNeeds(['base.pose'])).toEqual(['base.person', 'base.pose'])
    expect(withNeeds(['base.person'])).toEqual(['base.person'])
    expect(withNeeds(['base.fall', 'base.person', 'base.fall'])).toEqual([...ALL])
  })

  it('drops ids this console does not know, and an empty choice stays empty', () => {
    expect(withNeeds(['base.vehicle', 'base.person'])).toEqual(['base.person'])
    expect(withNeeds([])).toEqual([])
  })
})

describe('toggleDetector (a checkbox)', () => {
  it('ticking Falls ticks Poses and People', () => {
    expect(toggleDetector([], 'base.fall')).toEqual([...ALL])
  })

  it('ticking Poses ticks People and leaves Falls alone', () => {
    expect(toggleDetector(['base.person'], 'base.pose')).toEqual(['base.person', 'base.pose'])
  })

  it('unticking People unticks Poses and Falls', () => {
    expect(toggleDetector([...ALL], 'base.person')).toEqual([])
  })

  it('unticking Poses unticks Falls and keeps People', () => {
    expect(toggleDetector([...ALL], 'base.pose')).toEqual(['base.person'])
  })

  it('unticking Falls keeps the rest', () => {
    expect(toggleDetector([...ALL], 'base.fall')).toEqual(['base.person', 'base.pose'])
  })
})

describe('selectionOf', () => {
  it('is the reported selection with needs applied', () => {
    expect(selectionOf(status({ selected: ['base.fall'] }))).toEqual([...ALL])
  })

  it('is every detector when the status does not say (None means all)', () => {
    expect(selectionOf(status({ selected: null }))).toEqual([...ALL])
    expect(selectionOf(status({ selected: [] }))).toEqual([...ALL])
  })
})

describe('detectionView', () => {
  it('notInstalled: no status ever', () => {
    expect(detectionView(undefined)).toEqual({ kind: 'notInstalled' })
  })

  it('olderRobot: a status without the setting (perception older than 0.0.31)', () => {
    const { enabled: _e, selected: _s, off_reason: _o, ...older } = status()
    expect(detectionView(older)).toEqual({ kind: 'olderRobot' })
    expect(detectionView(status({ enabled: null }))).toEqual({ kind: 'olderRobot' })
  })

  it('on: with the detectors running (degraded counts as running)', () => {
    const s = status({
      selected: ['base.person', 'base.pose'],
      detectors: [info('base.person', { status: 'degraded' }), info('base.pose'), info('base.fall', { status: 'unavailable', reason: 'switched off' })],
    })
    expect(detectionView(s)).toEqual({
      kind: 'on', setting: { enabled: true, selected: ['base.person', 'base.pose'] }, running: ['base.person', 'base.pose'],
    })
  })

  it('off: switched off, with the remembered selection', () => {
    expect(detectionView(offStatus('switched_off', false, ['base.person']))).toEqual({
      kind: 'off', setting: { enabled: false, selected: ['base.person'] },
    })
  })

  it('off when enabled is false even without a reason', () => {
    expect(detectionView(status({ enabled: false, off_reason: null })).kind).toBe('off')
  })

  it('survey: held off by a survey, with the setting it comes back to', () => {
    expect(detectionView(offStatus('survey', true, [...ALL]))).toEqual({
      kind: 'survey', setting: { enabled: true, selected: [...ALL] },
    })
    // Switched off before the survey: still the survey's hold, setting off.
    expect(detectionView(offStatus('survey', false, ['base.person']))).toEqual({
      kind: 'survey', setting: { enabled: false, selected: ['base.person'] },
    })
  })

  it('unavailable: on, but the camera is unavailable, with the reason', () => {
    const s = status({
      source_state: 'unavailable', fps: null,
      detectors: ALL.map((id) => info(id, { status: 'unavailable', fps: null, reason: 'no frames from the camera' })),
    })
    expect(detectionView(s)).toEqual({
      kind: 'unavailable', setting: { enabled: true, selected: [...ALL] }, reason: 'no frames from the camera',
    })
  })

  it('unavailable when no chosen detector runs, even with the camera live', () => {
    const s = status({
      selected: ['base.person'],
      detectors: [info('base.person', { status: 'unavailable', reason: 'model failed to load' }), info('base.pose', { status: 'unavailable', reason: 'switched off' })],
    })
    expect(detectionView(s)).toMatchObject({ kind: 'unavailable', reason: 'model failed to load' })
  })

  it('unavailable with a null reason when nothing says why', () => {
    expect(detectionView(status({ source_state: 'unavailable', detectors: [] }))).toMatchObject({ kind: 'unavailable', reason: null })
  })
})

describe('switchParams (the on/off switch)', () => {
  it('switching off sends enabled false and keeps the selection', () => {
    expect(switchParams({ enabled: true, selected: ['base.person'] }, false)).toEqual({ enabled: false, detectors: ['base.person'] })
  })

  it('switching on sends the remembered selection', () => {
    expect(switchParams({ enabled: false, selected: ['base.person', 'base.pose'] }, true))
      .toEqual({ enabled: true, detectors: ['base.person', 'base.pose'] })
  })

  it('sends all three as a list, never by omitting it', () => {
    expect(switchParams({ enabled: false, selected: [...ALL] }, true)).toEqual({ enabled: true, detectors: [...ALL] })
  })

  it('never sends an empty list (the schema refuses one): no selection means all', () => {
    expect(switchParams({ enabled: false, selected: [] }, true)).toEqual({ enabled: true, detectors: [...ALL] })
  })
})

describe('checkboxParams (a checkbox click)', () => {
  const on = (selected: DetectionSetting['selected']): DetectionSetting => ({ enabled: true, selected })

  it('ticking Falls sends all three', () => {
    expect(checkboxParams(on(['base.person']), 'base.fall')).toEqual({ enabled: true, detectors: [...ALL] })
  })

  it('unticking People with only People left switches detection off and keeps People remembered', () => {
    expect(checkboxParams(on(['base.person']), 'base.person')).toEqual({ enabled: false, detectors: ['base.person'] })
  })

  it('unticking People with all three switches off, keeping all three remembered', () => {
    expect(checkboxParams(on([...ALL]), 'base.person')).toEqual({ enabled: false, detectors: [...ALL] })
  })

  it('unticking Falls keeps detection on with People and Poses', () => {
    expect(checkboxParams(on([...ALL]), 'base.fall')).toEqual({ enabled: true, detectors: ['base.person', 'base.pose'] })
  })

  it('while off, a checkbox edits the remembered selection and leaves detection off', () => {
    expect(checkboxParams({ enabled: false, selected: ['base.person'] }, 'base.pose'))
      .toEqual({ enabled: false, detectors: ['base.person', 'base.pose'] })
  })
})

describe('detectionMenu', () => {
  it('shows the switch and a box per detector from the setting', () => {
    expect(detectionMenu(detectionView(status({ selected: ['base.person', 'base.pose'] })))).toEqual({
      switchOn: true, checked: { 'base.person': true, 'base.pose': true, 'base.fall': false },
    })
  })

  it('while a survey holds detection off, shows the setting it comes back to', () => {
    expect(detectionMenu(detectionView(offStatus('survey', true, ['base.person'])))?.switchOn).toBe(true)
  })

  it('is null where there is no switch to show', () => {
    expect(detectionMenu(detectionView(undefined))).toBeNull()
    expect(detectionMenu({ kind: 'olderRobot' })).toBeNull()
  })
})

describe('detectionButton (the "AI" button on the command bar)', () => {
  const robot = (over: Partial<RobotState> = {}): RobotState => {
    const base = initialRobots[1]
    return { ...base, bridge: { ...base.bridge!, schema_version: DETECTION_SCHEMA }, ...over }
  }

  it('on: shows the count of chosen detectors and opens the menu', () => {
    expect(detectionButton(robot(), status({ selected: ['base.fall'] }))).toEqual({
      kind: 'on', count: 3, enabled: true, setting: { enabled: true, selected: [...ALL] },
    })
  })

  it('off and survey carry no count', () => {
    expect(detectionButton(robot(), offStatus('switched_off', false, ['base.person']))).toMatchObject({ kind: 'off', count: null, enabled: true })
    expect(detectionButton(robot(), offStatus('survey', true, [...ALL]))).toMatchObject({ kind: 'survey', count: null, enabled: true })
  })

  it('unavailable still counts what was chosen', () => {
    expect(detectionButton(robot(), status({ source_state: 'unavailable' }))).toMatchObject({ kind: 'unavailable', count: 3, enabled: true })
  })

  it('notInstalled and olderRobot are disabled, with no setting', () => {
    expect(detectionButton(robot(), undefined)).toEqual({ kind: 'notInstalled', count: null, enabled: false, setting: null })
    const { enabled: _e, selected: _s, off_reason: _o, ...older } = status()
    expect(detectionButton(robot(), older)).toEqual({ kind: 'olderRobot', count: null, enabled: false, setting: null })
  })

  it('is olderRobot when the bridge is older than 0.0.31, whatever perception says (the backend refuses it)', () => {
    const base = initialRobots[1]
    const old = robot({ bridge: { ...base.bridge!, schema_version: '0.0.30' } })
    expect(detectionButton(old, status())).toMatchObject({ kind: 'olderRobot', enabled: false })
    expect(detectionButton(robot({ bridge: undefined }), status())).toMatchObject({ kind: 'olderRobot', enabled: false })
  })

  it('is disabled with the policy reason under the E-Stop latch, keeping its state', () => {
    const b = detectionButton(robot({ abstract_state: 'E_STOP', sdk_state: 'passive' }), status())
    expect(b).toMatchObject({ kind: 'on', count: 3, enabled: false })
    expect(b.reason).toBeTruthy()
  })

  it('is disabled with a reason when the robot is offline', () => {
    const r = robot()
    const b = detectionButton({ ...r, connectivity: { ...r.connectivity, bridge_state: 'offline' } }, status())
    expect(b.enabled).toBe(false)
    expect(b.reason).toBeTruthy()
  })

  it('stays enabled while a mission runs', () => {
    const run = {
      phase: 'running', runId: 'r1', missionName: 'Patrol', stepLabel: 'Walk', blockId: 'b1', redoStepLabel: null,
      startedAt: 't', owner: 'mission:r1', youHoldControl: false, estimateS: null,
    } as const
    expect(detectionButton(robot({ abstract_state: 'AUTO_MISSION', control_owner: 'mission:r1' }), status(), run).enabled).toBe(true)
  })
})

describe('detectorRows (Fleet: which models a robot runs, and how)', () => {
  const setting = (selected: string[], enabled = true): DetectionSetting => ({ enabled, selected: withNeeds(selected) })

  it('no perception status: no rows', () => {
    expect(detectorRows(undefined, null)).toEqual([])
  })

  it('one row per switchable detector, with what perception reports for it', () => {
    const s = status({ detectors: [info('base.person', { version: 'yolo11n', fps: 9.8 }), info('base.pose', { status: 'degraded', fps: 3.1 }), info('base.fall')] })
    const rows = detectorRows(s, setting([...ALL]))
    expect(rows.map((r) => [r.id, r.known, r.chosen, r.state])).toEqual([
      ['base.person', true, true, 'running'],
      ['base.pose', true, true, 'slow'],
      ['base.fall', true, true, 'running'],
    ])
    expect(rows[0]).toMatchObject({ version: 'yolo11n', fps: 9.8, kind: 'model' })
    expect(rows[2].kind).toBe('derived')
  })

  it('a detector left out of the selection is off, even if an old report says running', () => {
    const rows = detectorRows(status(), setting(['base.person']))
    expect(rows.map((r) => [r.id, r.chosen, r.state])).toEqual([
      ['base.person', true, 'running'],
      ['base.pose', false, 'off'],
      ['base.fall', false, 'off'],
    ])
  })

  it("a chosen detector that failed carries perception's reason; one not reported says so", () => {
    const s = status({ detectors: [info('base.person', { status: 'unavailable', fps: null, reason: 'model file missing' })] })
    const rows = detectorRows(s, setting([...ALL]))
    expect(rows[0]).toMatchObject({ state: 'failed', reason: 'model file missing', fps: null })
    expect(rows[1]).toMatchObject({ state: 'notReported', version: null, fps: null })
  })

  it('switched off or held by a survey: every row is off, the selection still shows', () => {
    for (const s of [offStatus('switched_off', false, ['base.person']), offStatus('survey', true, ['base.person'])]) {
      const rows = detectorRows(s, setting(['base.person'], s.enabled ?? false))
      expect(rows.map((r) => [r.chosen, r.state])).toEqual([[true, 'off'], [false, 'off'], [false, 'off']])
    }
  })

  it('follows the setting it is given (one just sent), not only the report', () => {
    const rows = detectorRows(status(), setting(['base.person'], false))
    expect(rows.every((r) => r.state === 'off')).toBe(true)
    expect(rows.map((r) => r.chosen)).toEqual([true, false, false])
  })

  it('a detector this console does not know is listed after, read-only', () => {
    const s = status({ detectors: [info('base.person'), info('site.vehicle', { version: 'v2', fps: 4 })] })
    const rows = detectorRows(s, setting([...ALL]))
    expect(rows.map((r) => r.id)).toEqual(['base.person', 'base.pose', 'base.fall', 'site.vehicle'])
    expect(rows[3]).toMatchObject({ known: false, chosen: true, state: 'running', version: 'v2', fps: 4 })
  })

  it('an older perception (no setting): rows come from the report alone', () => {
    const { enabled: _e, selected: _s, off_reason: _o, ...older } = status({ detectors: [info('base.person'), info('base.pose', { status: 'unavailable', reason: 'no frames' })] })
    const rows = detectorRows(older, null)
    expect(rows.map((r) => [r.id, r.chosen, r.state])).toEqual([
      ['base.person', true, 'running'],
      ['base.pose', false, 'failed'],
      ['base.fall', false, 'notReported'],
    ])
  })
})
