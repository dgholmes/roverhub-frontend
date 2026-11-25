// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { initialRobots } from '@/mocks/mockRobots'
import { useSessionStore } from '@/store/useSessionStore'
import { DEFAULT_DISPATCH_RULE, type MissionLibraryEntry, type MissionTask, type RobotState } from '@/types'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const run = vi.hoisted(() => ({ fn: vi.fn() }))
vi.mock('@/missions/startMissionRun', async (actual) => ({
  ...(await actual<typeof import('@/missions/startMissionRun')>()),
  runMissionNowAndOpen: (...args: unknown[]) => run.fn(...args),
}))

// The library's preview needs a live Leaflet map and the block canvas: stood in.
vi.mock('./RoutePreviewMap', () => ({ RoutePreviewMap: () => <i data-preview="route" /> }))
vi.mock('./visual-program/ProgramPreview', () => ({ ProgramPreview: () => <i data-preview="program" /> }))

import { mockMaps } from '@/mocks/maps'
import type { SiteMap } from '@/types/maps'
import { MissionLibraryView } from './MissionLibraryView'
import { RunMissionButton } from './RunMissionButton'

const base: RobotState = {
  ...initialRobots[1],
  abstract_state: 'STAND', posture: 'upright', control_owner: null, robot_type: 'quad',
  battery: { percent: 90, est_runtime_min: 200, charging: false },
  connectivity: { ...initialRobots[1].connectivity, bridge_state: 'connected', grpc: 'connected' },
  bridge: initialRobots[1].bridge ? { ...initialRobots[1].bridge, last_heartbeat_at: new Date().toISOString() } : undefined,
}
const bot = (id: string, name: string, over: Partial<RobotState> = {}): RobotState => ({ ...base, robot_id: id, name, ...over })
const alpha = bot('r-alpha', 'Alpha')
const bravo = bot('r-bravo', 'Bravo')
const gone = bot('r-gone', 'Gone', { connectivity: { ...base.connectivity, bridge_state: 'offline' } })
const wheel = bot('r-wheel', 'Wheely', { robot_type: 'wheel' })

const pictlab: MissionLibraryEntry = {
  mission_id: 'm-pict', name: 'Pictlab', type: 'patrol', kind: 'route', version: 1, creator: 'x', updated_at: '', map_id: 'map',
  site_id: 's1', segments: [],
  waypoints: [{ waypoint_id: 'w1', label: 'A', x_m: 0, y_m: 0, z_m: null, heading_deg: null, tolerance_m: 0.5, actions: [], status: 'pending' }],
}
const task = (robot: string): MissionTask => ({
  task_id: 't-' + robot, mission_id: 'm-pict', site_id: 's1', name: null, robot_id: robot, schedule: null,
  dispatch_rule: { ...DEFAULT_DISPATCH_RULE }, status: 'enabled', max_duration_min: null,
  created_by: 'op', created_at: '', updated_at: '', version: 1,
})

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  run.fn.mockReset()
  useSessionStore.setState({ selectedRobotId: null })
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

function render(robots: RobotState[], tasks: MissionTask[] = []) {
  act(() => root.render(<RunMissionButton siteId="s1" mission={pictlab} robots={robots} tasks={tasks} />))
}
const trigger = () => [...host.querySelectorAll('button')].find((b) => b.getAttribute('aria-haspopup') === 'dialog')!
const dialog = () => host.querySelector<HTMLElement>('[role="alertdialog"]')
const radio = (id: string) => host.querySelector<HTMLInputElement>(`input[type="radio"][value="${id}"]`)!
const row = (id: string) => host.querySelector<HTMLElement>(`[data-robot-row="${id}"]`)!
const button = (label: string) => [...dialog()!.querySelectorAll('button')].find((b) => b.textContent === label)!
const openChooser = () => act(() => trigger().click())

describe('RunMissionButton', () => {
  it('is a primary Run… button that opens a chooser of the site robots', () => {
    render([alpha, gone])
    expect(trigger().textContent).toBe(i18n.t('missions.library.run.button'))
    expect(trigger().className).toContain('primary')
    expect(dialog()).toBeNull()
    openChooser()
    expect(trigger().getAttribute('aria-expanded')).toBe('true')
    expect(dialog()!.textContent).toContain(i18n.t('missions.library.run.title', { name: 'Pictlab' }))
    expect(row('r-alpha').textContent).toContain('Alpha')
    expect(row('r-alpha').textContent).toContain(i18n.t('missions.robot.available'))
    expect(row('r-gone').textContent).toContain(i18n.t('missions.robot.offline'))
  })

  it("ticks the robot the mission's tasks use, and focuses it", () => {
    render([alpha, bravo], [task('r-bravo')])
    openChooser()
    expect(radio('r-bravo').checked).toBe(true)
    expect(radio('r-alpha').checked).toBe(false)
    expect(document.activeElement).toBe(radio('r-bravo'))
  })

  it('lists robots that would be refused but does not let them be picked, with the reason', () => {
    render([alpha, gone, wheel, bot('r-low', 'Low', { battery: { percent: 9, est_runtime_min: 5, charging: false } })])
    openChooser()
    expect(radio('r-alpha').disabled).toBe(false)
    expect(radio('r-gone').disabled).toBe(true)
    expect(radio('r-wheel').disabled).toBe(true)
    expect(row('r-wheel').textContent).toContain(i18n.t('missions.library.run.off.wheelRobot'))
    expect(radio('r-low').disabled).toBe(true)
    expect(row('r-low').textContent).toContain(i18n.t('missions.library.run.off.batteryLow'))
  })

  it('does not tick a default that cannot run, and Start waits for a pick', () => {
    render([gone, alpha], [task('r-gone')])
    openChooser()
    expect(radio('r-gone').checked).toBe(false)
    const start = button(i18n.t('missions.library.run.start'))
    expect(start.disabled).toBe(true)
    act(() => radio('r-alpha').click())
    expect(start.disabled).toBe(false)
  })

  it('starts the run on the picked robot, saying Starting… meanwhile, and closes on success', async () => {
    let finish!: (v: unknown) => void
    run.fn.mockReturnValue(new Promise((res) => { finish = res }))
    render([alpha, bravo], [task('r-alpha')])
    openChooser()
    act(() => radio('r-bravo').click())
    await act(async () => button(i18n.t('missions.library.run.start')).click())
    expect(run.fn).toHaveBeenCalledWith('s1', pictlab, 'r-bravo')
    expect(dialog()!.textContent).toContain(i18n.t('missions.library.run.starting'))
    await act(async () => { finish({ ok: true, robotId: 'r-bravo', runId: 'run-1' }) })
    expect(dialog()).toBeNull()
  })

  it('keeps a refusal in view, in the chooser, which stays open', async () => {
    run.fn.mockResolvedValue({ ok: false, reason: 'Robot is in E-Stop.' })
    render([alpha])
    openChooser()
    await act(async () => button(i18n.t('missions.library.run.start')).click())
    expect(dialog()).not.toBeNull()
    expect(dialog()!.querySelector('[role="alert"]')?.textContent).toBe('Robot is in E-Stop.')
    expect(button(i18n.t('missions.library.run.start')).textContent).toBe(i18n.t('missions.library.run.start'))
  })

  it('closes on Escape and on Cancel, giving focus back to Run…', () => {
    render([alpha])
    openChooser()
    act(() => { dialog()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
    expect(dialog()).toBeNull()
    expect(document.activeElement).toBe(trigger())
    openChooser()
    act(() => button(i18n.t('missions.library.run.cancel')).click())
    expect(dialog()).toBeNull()
    expect(document.activeElement).toBe(trigger())
    expect(run.fn).not.toHaveBeenCalled()
  })

  it('says so when the site has no robots', () => {
    render([])
    openChooser()
    expect(dialog()!.textContent).toContain(i18n.t('missions.library.run.noRobots'))
    expect(button(i18n.t('missions.library.run.start')).disabled).toBe(true)
  })
})

describe('in the mission library', () => {
  const office: SiteMap = { ...mockMaps[0], map_id: 'map-office', name: 'Office 3F' }
  const onMap = { ...pictlab, map_id: office.map_id }
  const lost = { ...pictlab, mission_id: 'm-lost', name: 'Lost loop', map_id: 'map-deleted', updated_at: '2026-01-01T00:00:00Z' }
  // Async: the library loads the site's tasks on mount, and that settles here.
  async function library(onOpenMap?: (id: string) => void, onOpen = vi.fn()) {
    await act(async () => root.render(
      <MissionLibraryView siteId="s1" missions={[onMap, lost]} maps={[office]} onOpen={onOpen} onSchedule={() => {}} onShowTasks={() => {}} onOpenMap={onOpenMap} />,
    ))
    return onOpen
  }
  const card = (name: string) => [...host.querySelectorAll<HTMLElement>('[role="option"]')].find((c) => c.textContent?.includes(name))!

  it('puts Run… last in the preview actions, as the one primary action', async () => {
    await library()
    const row = trigger().closest('div[style*="pointer-events"]')!
    const labels = [...row.querySelectorAll('button')].map((b) => b.textContent)
    expect(labels).toEqual([i18n.t('missions.editor.schedule'), i18n.t('missions.library.editMission'), i18n.t('missions.library.run.button')])
    const primaries = [...row.querySelectorAll('button')].filter((b) => b.className.includes('primary'))
    expect(primaries).toEqual([trigger()])
  })

  it("makes a known map's chip a link to it that neither previews nor opens the card", async () => {
    const onOpenMap = vi.fn()
    const onOpen = await library(onOpenMap)
    const link = card('Pictlab').querySelector<HTMLButtonElement>('[data-map-chip] button')!
    expect(link.title).toBe(i18n.t('missions.library.run.openMap'))
    expect(link.textContent).toBe('Office 3F')
    // Preview the other card, then follow the link on this one.
    act(() => card('Lost loop').click())
    act(() => link.click())
    expect(onOpenMap).toHaveBeenCalledWith('map-office')
    expect(card('Pictlab').getAttribute('aria-selected')).toBe('false')
    act(() => { link.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })) })
    act(() => { link.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })) })
    expect(onOpen).not.toHaveBeenCalled()
    // A missing map stays a plain chip.
    expect(card('Lost loop').querySelector('[data-map-chip] button')).toBeNull()
  })

  it('leaves every chip plain without onOpenMap', async () => {
    await library()
    expect(host.querySelector('[data-map-chip] button')).toBeNull()
    expect(card('Pictlab').querySelector('[data-map-chip]')?.textContent).toBe('Office 3F')
  })
})
