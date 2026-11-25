import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import '@/i18n'
import i18n from '@/i18n'
import { mockMaps } from '@/mocks/maps'
import { mockMissionLibrary } from '@/mocks/mockMissionLibrary'
import type { ProgramBlock } from '@/missions/program/types'
import type { RunLogLine } from '@/missions/program/runLog'
import type { MissionLibraryEntry } from '@/types'
import type { SiteMap } from '@/types/maps'

/**
 * The two precision editors open read-only on a touch screen (M4 §7.6.3): a
 * thumb cannot honestly drag a waypoint, rearrange a block or draw a polygon,
 * so rather than offer targets it will miss, the mission editor shows the
 * library's own read-only preview and the map editor shows nothing to draw
 * with. Both say why. What stays live is running: Run now and Schedule are
 * untouched, because running a mission from a phone is the point of M4.
 *
 * Vitest runs with `environment: 'node'`, so this is `renderToStaticMarkup`
 * with the leaves that reach Leaflet, Blockly, three.js and the stores stood
 * in -- the pattern of `liveops/touch/TouchLiveOps.test.tsx`. Each branch is
 * rendered both ways: `useTouchShell` answers `{ touch: false }` with no DOM,
 * so without the mock below every case here would quietly assert the desktop
 * branch and pass for the wrong reason.
 */

// ── The shell, which is the whole point ─────────────────────────────────────
const shell = vi.hoisted(() => ({ touch: false }))
vi.mock('@/lib/useTouchShell', () => ({
  useTouchShell: () => ({ touch: shell.touch, orientation: 'portrait' as const, big: false }),
}))

// ── The mission editor's heavy leaves ───────────────────────────────────────
// Each carries the marker the assertions below look for: what is pinned here
// is *which* of the two the editor mounts, never what either draws. The real
// pairs are MissionMapEditor/RoutePreviewMap and BlocklyEditor/ProgramPreview,
// and each owns its own picture in its own test.
vi.mock('./route-editor/MissionMapEditor', () => ({ MissionMapEditor: () => <i data-mission-map-editor="" /> }))
vi.mock('./route-editor/MissionMapMenu', () => ({ MissionMapMenu: () => <i data-mission-map-menu="" /> }))
vi.mock('./RoutePreviewMap', () => ({ RoutePreviewMap: () => <i data-route-preview="" /> }))
vi.mock('./visual-program/BlocklyEditor', () => ({ BlocklyEditor: () => <i data-blockly-editor="" /> }))
vi.mock('./visual-program/ProgramPreview', () => ({ ProgramPreview: () => <i data-program-preview="" /> }))
// RunLog is NOT stood in: it is the Program tab's second column, and whether
// it stacks or keeps its 300 px is one of the things asserted below.
// MissionAnnouncements and MissionRules are NOT stood in: both are plain form
// panes reached by a tab the touch shell leaves enabled, and whether their
// controls are live is exactly what the tab assertions below ask.

// Reading a saved program needs a headless Blockly workspace, which is the one
// thing a `node` process cannot have. The blocks it returns are what the touch
// branch must hand the run bar, so they are identifiable.
const SAVED_BLOCKS: ProgramBlock[] = [{ id: 'saved-1', type: 'rh_mode', fields: { MODE: 'stand' }, inputs: {} }]
vi.mock('./visual-program/savedProgram', () => ({ savedProgramBlocks: () => SAVED_BLOCKS }))

// The run itself: its blockers, its state and its start are the run bar's and
// `useEdgeTestRun`'s own business. Stood in as an idle run with nothing in its
// way, so what the assertions see on the Run button is the editor's doing.
const RUN = {
  state: 'idle' as const, runId: null, refusal: null, lines: [] as RunLogLine[], dry: null, shows: null as 'run' | 'dry' | null,
  blockers: [] as never[], canDryRun: false, activeWaypointId: null, stopping: false,
  stepLabel: null, ended: null, steps: [], programIssues: [], missionErrors: [], robot: undefined,
  startDryRun: () => {}, start: async () => {}, stop: () => {},
}
/** A run far enough along for the log to draw its list: with no lines and
 *  nothing shown, RunLog renders its empty note and no <ol> at all. */
const GOING = {
  shows: 'run' as const,
  lines: [{ key: 1, at: 0, blockId: 'b1', label: 'Stand', result: 'done' as const }],
}
const edgeTestRun = vi.hoisted(() => vi.fn())
vi.mock('@/missions/program/useEdgeTestRun', () => ({ useEdgeTestRun: edgeTestRun }))

// ── Stores and the provider ─────────────────────────────────────────────────
const stores = vi.hoisted(() => ({
  liveops: { missions: {}, activeCommands: [], dispatchCommand: () => {} } as Record<string, unknown>,
}))
vi.mock('@/store/useLiveOpsStore', () => ({
  useLiveOpsStore: (sel: (s: Record<string, unknown>) => unknown) => sel(stores.liveops),
}))
vi.mock('@/missions/useMissionStore', () => ({
  useMissionStore: (sel: (s: Record<string, unknown>) => unknown) => sel({ save: () => {}, remove: () => {} }),
}))
vi.mock('@/missions/useTaskStore', () => ({
  useTaskStore: (sel: (s: Record<string, unknown>) => unknown) => sel({ tasks: [], loadTasks: () => {} }),
}))
vi.mock('@/lib/realtime/dataProvider', () => ({
  dataProvider: { sampleSite: () => ({ zones: [] }), getMap: async () => null },
}))

const siteMap: SiteMap = { ...mockMaps[0], status: 'active' }
vi.mock('@/missions/useMissionMap', () => ({
  useMissionMap: () => ({ resolved: { status: 'map', map: siteMap }, retry: () => {} }),
  useSiteMaps: () => ({ maps: [siteMap], shown: siteMap }),
  mapPropsFor: () => ({}),
}))

// ── The map editor's heavy leaves ───────────────────────────────────────────
vi.mock('@/org/useCan', () => ({ useCan: () => true }))
vi.mock('@/components/maps/editor/useEditorFloor', () => ({
  useEditorFloor: () => ({ status: 'loading' }),
  useEditorCloud: () => ({ status: 'loading' }),
}))
vi.mock('@/components/maps/editor/EditorScene', () => ({ EditorScene: () => <i data-editor-scene="" /> }))
vi.mock('@/components/maps/editor/FindMovingPanel', () => ({ FindMovingPanel: () => <i data-find-moving="" /> }))

import { MapEditor } from '@/components/maps/editor/MapEditor'
import type { EditorTab } from './MissionEditor'
import { MissionEditor } from './MissionEditor'
import { StepInspector } from './StepInspector'
import { StepList } from './StepList'

const route = mockMissionLibrary.find((m) => m.kind === 'route')!
const program = mockMissionLibrary.find((m) => m.kind === 'program')!
const firstStep = route.waypoints[0]
// One of each announcement and ground setting, so the Announcements and
// Settings tabs have controls to be live or disabled.
const withSettings: MissionLibraryEntry = {
  ...route,
  announcements: [{ announcement_id: 'ann-1', clip_id: 'clip-1', text: 'Mind the step', volume: 100, at: '09:00', repeat_every_min: null, until: null }],
}

function renderEditor(
  { touch, kind, isNew = false, tab, run }: {
    touch: boolean; kind: 'route' | 'program'; isNew?: boolean; tab?: EditorTab
    /** Fields to override on the stood-in run, e.g. to give the log lines. */
    run?: Partial<typeof RUN>
  },
): string {
  shell.touch = touch
  edgeTestRun.mockReturnValue(run ? { ...RUN, ...run } : RUN)
  const initial: MissionLibraryEntry = kind === 'route' ? withSettings : program
  return renderToStaticMarkup(
    <MissionEditor
      siteId="s1" initial={initial} isNew={isNew} robots={[]} timezone="Asia/Seoul"
      initialTab={tab ?? (kind === 'route' ? 'route' : 'program')}
      onClose={() => {}} onSaved={() => {}} onDeleted={() => {}} onSchedule={() => {}}
    />,
  )
}

function renderMapEditor({ touch }: { touch: boolean }): string {
  shell.touch = touch
  return renderToStaticMarkup(
    <MapEditor map={siteMap} floorIndex={siteMap.floors[0].index} onClose={() => {}} onSaved={() => {}} />,
  )
}

/** The markup of the `<button>` holding `needle`, from its tag to its close.
 * Static markup never self-closes a button, so the slice is exact. */
function buttonWith(html: string, needle: string): string {
  const at = html.indexOf(needle)
  expect(at, `the markup has no "${needle}"`).toBeGreaterThan(-1)
  const open = html.lastIndexOf('<button', at)
  expect(open, `"${needle}" is not inside a button`).toBeGreaterThan(-1)
  const close = html.indexOf('</button>', at)
  return html.slice(open, close + '</button>'.length)
}

/** One element's inline style as a property map. Read by property, because
 *  the order React serializes them in is an implementation detail: a spread
 *  that moves one declaration must not fail a layout assertion. */
function styleOf(html: string, attr: string): Map<string, string> {
  const at = html.indexOf(attr)
  expect(at, `the markup has no ${attr}`).toBeGreaterThan(-1)
  const tag = html.slice(html.lastIndexOf('<', at), html.indexOf('>', at))
  return declarations(tag.match(/style="([^"]*)"/)?.[1] ?? '')
}

/** Every inline style in the markup, as property maps. */
function allStyles(html: string): Map<string, string>[] {
  return [...html.matchAll(/style="([^"]*)"/g)].map(([, decl]) => declarations(decl))
}

function declarations(decl: string): Map<string, string> {
  return new Map(decl.split(';').filter(Boolean).map((d) => {
    const colon = d.indexOf(':')
    return [d.slice(0, colon).trim(), d.slice(colon + 1).trim()] as [string, string]
  }))
}

/** Is some element the pane that carries `edge` (the step list's right border,
 *  the inspector's left one), at `width`? */
const paneAt = (html: string, edge: string, width: string) =>
  allStyles(html).some((st) => st.has(edge) && st.get('width') === width)

const RUN_LOG = `aria-label="${i18n.t('missions.program.run.log.title')}"`

// Each anchored on its own label where that label cannot be mistaken for
// another button's: Save is matched as the start of its text node, because
// Schedule's "Save the mission first" title would otherwise come first.
const saveButton = (html: string) => buttonWith(html, `>${i18n.t('missions.editor.save')}`)
const deleteButton = (html: string) => buttonWith(html, `aria-label="${i18n.t('missions.editor.delete')}"`)
const scheduleButton = (html: string) => buttonWith(html, `>${i18n.t('missions.editor.schedule')}<`)
const runNowButton = (html: string) => buttonWith(html, `>${i18n.t('missions.program.run.run')}<`)
const backButton = (html: string) => buttonWith(html, `>${i18n.t('missions.editor.back')}<`)

describe('the mission editor on touch', () => {
  it('opens a route mission read-only, with its steps and its checks', () => {
    const html = renderEditor({ touch: true, kind: 'route' })
    expect(html).toContain(i18n.t('touch.readOnly.missionTitle'))
    expect(html).toContain(i18n.t('touch.readOnly.missionBody'))
    expect(html).toContain('data-route-preview')
    expect(html).not.toContain('data-mission-map-editor')
    // Still readable and navigable: the totals, every step, and the steps are
    // still selectable (each row is a button).
    expect(html).toContain(i18n.t('missions.editor.totalLength'))
    for (const wp of route.waypoints) expect(html).toContain(wp.label)
    expect(html).toContain('role="button"')
  })

  it('hands the step list and the step inspector their read-only selves', () => {
    const html = renderEditor({ touch: true, kind: 'route' })
    // The list stops inviting new steps...
    expect(html).not.toContain(i18n.t('missions.editor.addHint'))
    // ...and the inspector marks itself read-only, whether or not a step is
    // selected. Matched exactly: the notice's own `data-read-only-notice`
    // would otherwise satisfy a looser assertion, and deleting the inspector's
    // `readOnly` would then fail nothing.
    expect(html).toContain('data-read-only=""')
  })

  it('disables the Announcements tab, which also writes to the mission', () => {
    const html = renderEditor({ touch: true, kind: 'route', tab: 'announcements' })
    expect(html).toContain('<fieldset disabled')
    // Still readable: the announcement itself is there to be read.
    expect(html).toContain(withSettings.announcements![0].text!)
  })

  it('disables the Settings tab, which also writes to the mission', () => {
    const html = renderEditor({ touch: true, kind: 'route', tab: 'settings' })
    expect(html).toContain('<fieldset disabled')
    expect(html).toContain(i18n.t('missions.rules.ground'))
  })

  it('shows a program as a preview, never the block canvas', () => {
    const html = renderEditor({ touch: true, kind: 'program' })
    expect(html).toContain('data-program-preview')
    expect(html).not.toContain('data-blockly-editor')
  })

  it('runs a program from the saved blocks, since the canvas never opens', () => {
    renderEditor({ touch: true, kind: 'program' })
    const calls = edgeTestRun.mock.calls
    expect(calls[calls.length - 1][0].blocks).toBe(SAVED_BLOCKS)
  })

  it('disables Save and Delete', () => {
    const html = renderEditor({ touch: true, kind: 'route', isNew: true })
    expect(saveButton(html)).toContain('disabled')
    expect(deleteButton(html)).toContain('disabled')
  })

  it('never disables Run now or Schedule, which are not editing', () => {
    const html = renderEditor({ touch: true, kind: 'route' })
    expect(runNowButton(html)).not.toContain('disabled')
    expect(scheduleButton(html)).not.toContain('disabled')
  })

  // Sizing is no longer this screen's business. The design system raises
  // `.rh-btn--sm` and `.rh-inputlike` under `[data-touch]` (kit.css, "Touch
  // sizing"), which replaced a `touch ? 44 : undefined` ternary here and in
  // four other page components. What this screen still owes is that its
  // controls are KIT controls, because a hand-rolled <button> is exactly what
  // that rule cannot reach -- it would sit at 28 px with nothing to say so.
  it('builds its controls from the kit, so the touch sizing reaches them', () => {
    const html = renderEditor({ touch: true, kind: 'route' })
    for (const button of [backButton, scheduleButton, runNowButton]) {
      expect(button(html)).toContain('rh-btn--sm')
    }
    // The robot picker is a button shaped like an input, and carries the
    // class that tells the design system to size it like one.
    expect(html).toContain('rh-inputlike')
  })

  // Neither shell hard-codes a height here any more: the one on a finger
  // comes from a stylesheet, and this is what keeps a ternary from coming
  // back to fight it.
  it('hard-codes no button height in either shell', () => {
    for (const touch of [true, false]) {
      const html = renderEditor({ touch, kind: 'route' })
      for (const button of [backButton, scheduleButton, runNowButton]) {
        expect(styleOf(button(html), '<button').has('min-height')).toBe(false)
      }
      expect(styleOf(html, 'aria-haspopup="listbox"').has('min-height')).toBe(false)
    }
  })

  // Measured in Chrome at 390 px before this: the three panes side by side
  // wanted 600 px, the shell clips rather than scrolls sideways, and the
  // whole right-hand pane was therefore unreachable -- not merely cramped.
  // Stacked, every pane is the full width and the column scrolls down to them.
  it('stacks its panes into one column instead of clipping them', () => {
    const html = renderEditor({ touch: true, kind: 'route' })
    const column = styleOf(html, 'data-editor-body')
    expect(column.get('flex-direction')).toBe('column')
    expect(column.get('overflow-y')).toBe('auto')
    // The step list and the step inspector keep neither their width nor the
    // divider that went with it. (Matched by that divider, because the
    // mission name input is 280 px wide too, and still is.)
    expect(paneAt(html, 'border-right', '280px')).toBe(false)
    expect(paneAt(html, 'border-left', '320px')).toBe(false)
  })

  it('stacks the Program tab too, where the run log is the second column', () => {
    const html = renderEditor({ touch: true, kind: 'program' })
    expect(styleOf(html, 'data-editor-body').get('flex-direction')).toBe('column')
    expect(styleOf(html, RUN_LOG).get('width')).toBe('100%')
  })

  // The editor's column is what scrolls when stacked, and nothing scrolls it
  // for the operator -- so the log keeps a scrollbar of its own, or the
  // newest step walks off the bottom during a run started from a phone.
  it('leaves the stacked run log something to scroll', () => {
    const list = styleOf(renderEditor({ touch: true, kind: 'program', run: GOING }), '<ol')
    expect(list.get('overflow-y')).toBe('auto')
    expect(list.has('max-height')).toBe(true)
    // It must not hand its height to the editor's column instead: nothing
    // scrolls that for the operator, so the newest step would walk away.
    expect(list.get('flex')).toBeUndefined()
  })

  it('keeps all three panes side by side on a fine pointer', () => {
    const route = renderEditor({ touch: false, kind: 'route' })
    const column = styleOf(route, 'data-editor-body')
    expect(column.get('flex-direction')).toBeUndefined()
    expect(column.get('overflow-y')).toBeUndefined()
    expect(paneAt(route, 'border-right', '280px')).toBe(true)
    expect(paneAt(route, 'border-left', '320px')).toBe(true)
    expect(styleOf(renderEditor({ touch: false, kind: 'program' }), RUN_LOG).get('width')).toBe('300px')
    const list = styleOf(renderEditor({ touch: false, kind: 'program', run: GOING }), '<ol')
    expect(list.get('flex')).toBe('1')
    expect(list.has('max-height')).toBe(false)
  })
})

describe('the mission editor on a fine pointer', () => {
  it('edits normally, and says nothing about touch', () => {
    const html = renderEditor({ touch: false, kind: 'route' })
    expect(html).not.toContain(i18n.t('touch.readOnly.missionTitle'))
    expect(html).toContain('data-mission-map-editor')
    expect(html).not.toContain('data-route-preview')
    expect(html).toContain(i18n.t('missions.editor.addHint'))
    expect(html).not.toContain('data-read-only')
  })

  it('leaves Save and Delete usable on an unsaved mission', () => {
    const html = renderEditor({ touch: false, kind: 'route', isNew: true })
    expect(saveButton(html)).not.toContain('disabled')
    expect(deleteButton(html)).not.toContain('disabled')
  })

  it('leaves the Announcements and Settings tabs live', () => {
    expect(renderEditor({ touch: false, kind: 'route', tab: 'announcements' })).not.toContain('<fieldset disabled')
    expect(renderEditor({ touch: false, kind: 'route', tab: 'settings' })).not.toContain('<fieldset disabled')
  })

  it('opens the block canvas for a program', () => {
    const html = renderEditor({ touch: false, kind: 'program' })
    expect(html).toContain('data-blockly-editor')
    expect(html).not.toContain('data-program-preview')
  })
})

describe('a read-only step list', () => {
  const list = (readOnly: boolean) => renderToStaticMarkup(
    <StepList
      waypoints={route.waypoints} issues={[]} selectedId={firstStep.waypoint_id} onSelect={() => {}}
      onMove={() => { throw new Error('a read-only list must never move a step') }}
      lengthM={32} durationS={60} readOnly={readOnly}
    />,
  )

  it('drops the reorder controls but keeps every step selectable', () => {
    const html = list(true)
    expect(html).not.toContain(i18n.t('missions.editor.moveUp'))
    expect(html).not.toContain(i18n.t('missions.editor.moveDown'))
    // Reading a mission means tapping through it: the rows are still buttons,
    // the selected one still says so, and the totals are still there.
    expect(html.match(/role="button"/g)).toHaveLength(route.waypoints.length)
    expect(html).toContain('aria-current="true"')
    expect(html).toContain(i18n.t('missions.editor.totalLength'))
  })

  it('keeps them on a fine pointer', () => {
    const html = list(false)
    expect(html).toContain(i18n.t('missions.editor.moveUp'))
    expect(html).toContain(i18n.t('missions.editor.moveDown'))
    expect(html).toContain(i18n.t('missions.editor.addHint'))
  })
})

/** Where every `<fieldset disabled>` starts and ends. Nothing rendered here
 * nests one inside another, so each close belongs to the nearest open. */
function disabledForms(html: string): [number, number][] {
  const out: [number, number][] = []
  for (let from = 0; ;) {
    const open = html.indexOf('<fieldset disabled', from)
    if (open === -1) return out
    const close = html.indexOf('</fieldset>', open)
    out.push([open, close])
    from = close + 1
  }
}

function insideDisabledForm(html: string, needle: string): boolean {
  const at = html.indexOf(needle)
  expect(at, `the markup has no "${needle}"`).toBeGreaterThan(-1)
  return disabledForms(html).some(([open, close]) => at > open && at < close)
}

describe('a read-only step inspector', () => {
  // The second step carries an action, so its row has something to open.
  const withAction = route.waypoints[1]
  const inspector = (readOnly: boolean, selected = firstStep) => renderToStaticMarkup(
    <StepInspector
      siteId="s1" ownerId="site-s1" mission={route} selected={selected} robotType="quad"
      onUpdateWaypoint={() => {}} onUpdateSegment={() => {}} onRemove={() => {}} onSelect={() => {}}
      readOnly={readOnly}
    />,
  )

  it('disables the whole form at once, the step name included', () => {
    const html = inspector(true)
    expect(insideDisabledForm(html, `value="${firstStep.label}"`)).toBe(true)
  })

  it('leaves the action rows openable, because opening one is how they are read', () => {
    const html = inspector(true, withAction)
    // The disclosure sits outside every disabled form: a reader must be able
    // to open the row to see which camera, or what an announcement says.
    expect(insideDisabledForm(html, 'data-action-row="0"')).toBe(false)
    // What it must not offer is rearranging or adding.
    expect(html).not.toContain(i18n.t('missions.actions.remove'))
    expect(html).not.toContain(i18n.t('missions.actions.wait'))
  })

  it('leaves the form live on a fine pointer', () => {
    const html = inspector(false, withAction)
    expect(html).not.toContain('<fieldset disabled')
    expect(html).toContain(i18n.t('missions.inspector.remove'))
    expect(html).toContain(i18n.t('missions.actions.remove'))
  })
})

describe('the map editor on touch', () => {
  it('takes the zone tools away and says why', () => {
    const html = renderMapEditor({ touch: true })
    expect(html).toContain(i18n.t('touch.readOnly.zonesTitle'))
    expect(html).toContain(i18n.t('touch.readOnly.zonesBody'))
    expect(html).not.toContain('data-zone-tools')
  })

  it('still offers the way back out, which is the only one the Maps page has', () => {
    const html = renderMapEditor({ touch: true })
    expect(buttonWith(html, i18n.t('missions.maps.editor.close'))).not.toContain('disabled')
  })

  it('does not call itself "Edit map" while editing is off', () => {
    const html = renderMapEditor({ touch: true })
    expect(html).toContain(`aria-label="${i18n.t('touch.readOnly.zonesSection')}"`)
    expect(html).not.toContain(`aria-label="${i18n.t('missions.maps.editor.title')}"`)
  })

  it('keeps the tools on a fine pointer', () => {
    const html = renderMapEditor({ touch: false })
    expect(html).toContain('data-zone-tools')
    expect(html).not.toContain(i18n.t('touch.readOnly.zonesTitle'))
  })
})
