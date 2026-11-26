// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import i18n from '@/i18n'
import type { MissionLibraryEntry, MissionWaypoint, RobotType, Segment, WaypointAction } from '@/types'
import { StepInspector } from './StepInspector'
import { WaypointActionList } from './WaypointActionList'

/**
 * Authoring a waypoint's Quick action (WaypointActionList) and a leg's gait
 * (StepInspector): what the editor offers, and what it writes into the mission.
 */

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

let latest: WaypointAction[] = []
function List({ initial = [] as WaypointAction[] }) {
  const [actions, setActions] = useState(initial)
  latest = actions
  return <WaypointActionList siteId="s1" ownerId="r1" actions={actions} onChange={setActions} />
}
const addQuick = () => host.querySelector<HTMLButtonElement>('[data-add-quick-action]')!
const picker = () => host.querySelector<HTMLElement>('[data-quick-action-picker]')
const move = (state: string) => picker()!.querySelector<HTMLButtonElement>(`[data-move="${state}"]`)!
const CLEAR = () => i18n.t('missions.actions.quick.clearSpace')

describe('the Quick action menu entry', () => {
  it('is offered beside the other actions, and opens a picker of LiveOps’ moves with their lengths', () => {
    act(() => root.render(<List />))
    expect(addQuick().textContent).toBe(i18n.t('missions.actions.quick_action'))
    expect(picker()).toBeNull()
    act(() => addQuick().click())
    const states = [...picker()!.querySelectorAll('[data-move]')].map((b) => b.getAttribute('data-move'))
    expect(states).toContain('gongxi')
    expect(states).toContain('wave')
    for (const gone of ['flying_trot', 'rl', 'drift', 'handstand']) expect(states).not.toContain(gone)
    expect(move('gongxi').textContent).toContain(i18n.t('command.gestures.gongxi'))
    expect(move('gongxi').textContent).toContain(i18n.t('missions.actions.quick.seconds', { s: 11.5 }))
    expect(move('dance0').textContent).toContain(i18n.t('missions.actions.quick.minSeconds', { m: 2, s: 7 }))
    expect(move('wave').textContent).toContain(i18n.t('missions.actions.quick.held'))
  })

  it('warns about clear space on Jump, Backflip and Twirl Jump only', () => {
    act(() => root.render(<List />))
    act(() => addQuick().click())
    const warned = [...picker()!.querySelectorAll('[data-move]')].filter((b) => b.textContent!.includes(CLEAR())).map((b) => b.getAttribute('data-move'))
    expect(warned.sort()).toEqual(['backflip', 'jump', 'twirl_jump'])
  })

  it('adds the picked move, and the action row carries the warning', () => {
    act(() => root.render(<List />))
    act(() => addQuick().click())
    act(() => move('backflip').click())
    expect(latest).toEqual([{ type: 'quick_action', label: i18n.t('command.gestures.backflip'), params: { state: 'backflip' } }])
    const row = host.querySelector<HTMLElement>('[data-action-row="0"]')!
    expect(row.textContent).toContain(i18n.t('missions.actions.quick_action'))
    expect(row.textContent).toContain(i18n.t('command.gestures.backflip'))
    expect(row.querySelector('[data-clear-space-warning]')?.textContent).toBe(CLEAR())
  })

  it('gives a held move (Wave) a duration, 5 s by default and editable, and a timed one none', () => {
    act(() => root.render(<List />))
    act(() => addQuick().click())
    act(() => move('wave').click())
    expect(latest[0].params).toEqual({ state: 'wave', seconds: 5 })
    const input = host.querySelector<HTMLInputElement>('input[type="number"]')!
    expect(input.min).toBe('1')
    expect(input.max).toBe('600')
    expect(input.value).toBe('5')
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    act(() => { setter.call(input, '30'); input.dispatchEvent(new Event('input', { bubbles: true })) })
    expect(latest[0].params.seconds).toBe(30)
    // Switched to a timed move in the open row: the duration goes.
    act(() => move('gongxi').click())
    expect(latest[0].params).toEqual({ state: 'gongxi' })
    expect(host.querySelector('input[type="number"]')).toBeNull()
    expect(host.querySelector('[data-action-row="0"] [data-clear-space-warning]')).toBeNull()
  })
})

describe('a leg’s gait in the inspector', () => {
  const wp = (id: string, x: number): MissionWaypoint =>
    ({ waypoint_id: id, label: id.toUpperCase(), x_m: x, y_m: 0, z_m: null, heading_deg: null, tolerance_m: 0.5, actions: [], status: 'pending' })
  const mission = (segments: Segment[] = []): MissionLibraryEntry => ({
    mission_id: 'm', name: 'M', type: 'patrol', kind: 'route', version: 1, creator: 'x', updated_at: '', map_id: 'map',
    waypoints: [wp('a', 0), wp('b', 5)], segments,
  })
  let updated: Segment | null = null
  const render = (robotType: RobotType | null, segments: Segment[] = []) => {
    const m = mission(segments)
    updated = null
    act(() => root.render(
      <StepInspector siteId="s1" ownerId="r1" mission={m} selected={m.waypoints[1]} robotType={robotType}
        onUpdateWaypoint={() => {}} onUpdateSegment={(s) => { updated = s }} onRemove={() => {}} onSelect={() => {}} />,
    ))
    return host.querySelector<HTMLSelectElement>('select[aria-describedby^="gait-hint"]')!
  }

  it('reads as the gait from here on, with the hint that it holds until changed', () => {
    const select = render('quad')
    expect(host.textContent).toContain(i18n.t('missions.inspector.gait'))
    expect(i18n.t('missions.inspector.gait')).toBe('Gait from here on')
    expect(document.getElementById(select.getAttribute('aria-describedby')!)!.textContent).toContain(i18n.t('missions.inspector.gaitHint'))
  })

  it('offers Keep current, Walk, Flying Trot and RL Gait, for a quad, an unknown robot and a wheel robot alike; never wheel_loco', () => {
    for (const type of ['quad', null, 'wheel'] as const) {
      const options = [...render(type).options].map((o) => o.value)
      expect(options, String(type)).toEqual(['', 'walk', 'flying_trot', 'rl'])
    }
    expect(i18n.t('misc.gait.rl')).toBe(i18n.t('command.gestures.rl'))
  })

  it('offers Keep current and Walk, and shows Flying Trot and RL Gait disabled with the reason', () => {
    const select = render('quad')
    const opts = [...select.options]
    expect(opts.map((o) => o.disabled)).toEqual([false, false, true, true])
    expect(opts.map((o) => o.textContent)).toEqual([
      i18n.t('missions.inspector.robotDefault'), i18n.t('misc.gait.walk'),
      i18n.t('missions.inspector.gaitNotYet', { gait: i18n.t('misc.gait.flying_trot') }),
      i18n.t('missions.inspector.gaitNotYet', { gait: i18n.t('misc.gait.rl') }),
    ])

    expect(document.getElementById(select.getAttribute('aria-describedby')!)!.textContent).toContain('The robot can only navigate while walking.')
  })

  it('sets Walk, and unsets back to Keep current', () => {
    const select = render('quad')
    act(() => { select.value = 'walk'; select.dispatchEvent(new Event('change', { bubbles: true })) })
    expect(updated).toMatchObject({ from_waypoint_id: 'a', to_waypoint_id: 'b', gait: 'walk' })
    const again = render('quad', [{ from_waypoint_id: 'a', to_waypoint_id: 'b', speed_mps: null, gait: 'walk', posture: null, wheel_leg_mode: null }])
    act(() => { again.value = ''; again.dispatchEvent(new Event('change', { bubbles: true })) })
    expect(updated).toMatchObject({ gait: null })
  })

  it('still shows a wheel_loco saved before, so the check that flags it points at something', () => {
    const select = render('quad', [{ from_waypoint_id: 'a', to_waypoint_id: 'b', speed_mps: null, gait: 'wheel_loco', posture: null, wheel_leg_mode: null }])
    expect(select.value).toBe('wheel_loco')
  })
})
