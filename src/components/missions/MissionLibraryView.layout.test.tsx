// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { mockMaps } from '@/mocks/maps'
import type { MissionLibraryEntry } from '@/types'
import type { SiteMap } from '@/types/maps'

/**
 * The library's layout follows the width, never the pointer (2026-11-26).
 *
 * A 1420 px tablet used to get the phone's list-only page: no preview, no
 * Schedule, no Run, and a tap went straight into the editor. The rule now:
 * at 700 px and up the page is the desktop's two panes whatever the pointer,
 * and `touch` only changes how a card is pressed (a second tap where a mouse
 * double-clicks). Below 700 px it is one pane at a time, and every action is
 * still reachable from the mission's preview.
 */

const shell = vi.hoisted(() => ({ touch: false, narrow: false }))
vi.mock('@/lib/useTouchShell', () => ({
  useTouchShell: () => ({ touch: shell.touch, narrow: shell.narrow, orientation: 'landscape' as const, big: true }),
}))
// The preview needs a live Leaflet map and the block canvas: stood in.
vi.mock('./RoutePreviewMap', () => ({ RoutePreviewMap: ({ missionId }: { missionId: string }) => <i data-preview="route" data-mission={missionId} /> }))
vi.mock('./visual-program/ProgramPreview', () => ({ ProgramPreview: () => <i data-preview="program" /> }))

import { MissionLibraryView } from './MissionLibraryView'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const base: SiteMap = mockMaps[0]
const office: SiteMap = { ...base, map_id: 'map-office', name: 'Office 3F' }
const carPark: SiteMap = { ...base, map_id: 'map-car-park', name: 'Car park B1' }

const mission = (over: Partial<MissionLibraryEntry>): MissionLibraryEntry => ({
  mission_id: 'm', name: 'M', type: 'patrol', kind: 'route', version: 1, creator: 'x', updated_at: '2026-11-01T00:00:00Z',
  map_id: office.map_id, site_id: 's1', waypoints: [], segments: [], ...over,
})
const nightPatrol = mission({ mission_id: 'a', name: 'Night patrol', updated_at: '2026-11-04T00:00:00Z' })
const carLoop = mission({ mission_id: 'b', name: 'Car park loop', map_id: carPark.map_id, updated_at: '2026-11-03T00:00:00Z' })
const MISSIONS = [nightPatrol, carLoop]
const MAPS = [office, carPark]

let host: HTMLDivElement
let root: Root
let onOpen: ReturnType<typeof vi.fn>
let onSchedule: ReturnType<typeof vi.fn>
beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  onOpen = vi.fn()
  onSchedule = vi.fn()
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

function render({ touch, narrow }: { touch: boolean; narrow: boolean }) {
  shell.touch = touch
  shell.narrow = narrow
  act(() => root.render(
    <MissionLibraryView
      siteId="s1" missions={MISSIONS} maps={MAPS}
      onOpen={onOpen as unknown as (id: string) => void} onSchedule={onSchedule as unknown as (id: string) => void} onShowTasks={() => {}}
    />,
  ))
}

const card = (name: string) => [...host.querySelectorAll<HTMLElement>('[role="option"]')].find((c) => c.textContent?.includes(name)) ?? null
const tap = (el: Element) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
const doubleClick = (el: Element) => act(() => { el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })) })
const buttonNamed = (label: string) =>
  [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === label) ?? null
const previewed = () => host.querySelector('[data-preview]')?.getAttribute('data-mission') ?? null
const backButton = () => buttonNamed(i18n.t('missions.view.missions'))
const searchRow = () => host.querySelector<HTMLElement>('[data-library-search-row]')!

/** Every action the preview offers, by its label. */
const ACTIONS = () => [i18n.t('missions.editor.schedule'), i18n.t('missions.library.editMission'), i18n.t('missions.library.run.button')]

describe('wide, with a finger (a tablet)', () => {
  it('keeps the desktop\'s two panes: the 340 px list beside the preview, with every action', () => {
    render({ touch: true, narrow: false })
    const list = host.querySelector<HTMLElement>('[role="listbox"]')!.parentElement!
    expect(list.style.width).toBe('340px')
    expect(previewed()).toBe('a')
    for (const label of ACTIONS()) expect(buttonNamed(label), label).not.toBeNull()
    expect(backButton()).toBeNull()
  })

  it('previews on the first tap and opens the editor on a second tap on the same card', () => {
    render({ touch: true, narrow: false })
    // The first card is previewed by default, but has not been tapped: one
    // tap on it must not go straight into the editor.
    tap(card('Night patrol')!)
    expect(onOpen).not.toHaveBeenCalled()
    tap(card('Car park loop')!)
    expect(previewed()).toBe('b')
    expect(onOpen).not.toHaveBeenCalled()
    tap(card('Car park loop')!)
    expect(onOpen.mock.calls).toEqual([['b']])
  })

  it('does not open twice on a double-tap, which is two taps and a dblclick', () => {
    render({ touch: true, narrow: false })
    const c = card('Car park loop')!
    tap(c)
    tap(c)
    doubleClick(c)
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('opens the editor from Edit mission and starts a task from Schedule', () => {
    render({ touch: true, narrow: false })
    tap(card('Car park loop')!)
    tap(buttonNamed(i18n.t('missions.library.editMission'))!)
    expect(onOpen).toHaveBeenCalledWith('b')
    tap(buttonNamed(i18n.t('missions.editor.schedule'))!)
    expect(onSchedule).toHaveBeenCalledWith('b')
  })

  it('puts search and the map filter side by side', () => {
    render({ touch: true, narrow: false })
    expect(searchRow().style.gridTemplateColumns).toContain(' ')
  })

  it('gives a card no finger-sized minimum height', () => {
    render({ touch: true, narrow: false })
    expect(card('Night patrol')!.style.minHeight).toBe('')
  })
})

describe('wide, with a mouse (the desktop)', () => {
  it('previews on click and opens on double-click', () => {
    render({ touch: false, narrow: false })
    tap(card('Car park loop')!)
    expect(previewed()).toBe('b')
    expect(onOpen).not.toHaveBeenCalled()
    doubleClick(card('Car park loop')!)
    expect(onOpen.mock.calls).toEqual([['b']])
  })

  it('is laid out exactly as on a tablet', () => {
    render({ touch: false, narrow: false })
    const desktop = host.innerHTML
    act(() => root.unmount())
    root = createRoot(host)
    render({ touch: true, narrow: false })
    expect(host.innerHTML).toBe(desktop)
  })
})

describe('narrow (a phone, or a narrow window)', () => {
  for (const touch of [true, false]) {
    describe(touch ? 'with a finger' : 'with a mouse', () => {
      it('shows the list alone, full width, with nothing previewed', () => {
        render({ touch, narrow: true })
        expect(card('Night patrol')).not.toBeNull()
        expect(previewed()).toBeNull()
        expect(host.querySelector<HTMLElement>('[role="listbox"]')!.parentElement!.style.width).toBe('')
        expect(searchRow().style.gridTemplateColumns).toBe('minmax(0, 1fr)')
      })

      it('shows the tapped mission\'s preview with every action and a way back, never the editor', () => {
        render({ touch, narrow: true })
        tap(card('Car park loop')!)
        expect(onOpen).not.toHaveBeenCalled()
        expect(host.querySelector('[data-library-preview]')).not.toBeNull()
        expect(previewed()).toBe('b')
        expect(host.textContent).toContain('Car park loop')
        // The list has made way for it.
        expect(card('Night patrol')).toBeNull()
        for (const label of ACTIONS()) expect(buttonNamed(label), label).not.toBeNull()
        // The totals are there too, below the map rather than over it.
        expect(host.textContent).toContain(i18n.t('missions.editor.totalLength'))
        expect(backButton()).not.toBeNull()
      })

      it('goes back to the list from the Missions button', () => {
        render({ touch, narrow: true })
        tap(card('Car park loop')!)
        tap(backButton()!)
        expect(host.querySelector('[data-library-preview]')).toBeNull()
        expect(card('Night patrol')).not.toBeNull()
        expect(card('Car park loop')).not.toBeNull()
        expect(onOpen).not.toHaveBeenCalled()
      })

      it('opens the editor and schedules from the preview\'s own buttons', () => {
        render({ touch, narrow: true })
        tap(card('Car park loop')!)
        tap(buttonNamed(i18n.t('missions.library.editMission'))!)
        expect(onOpen.mock.calls).toEqual([['b']])
        tap(buttonNamed(i18n.t('missions.editor.schedule'))!)
        expect(onSchedule).toHaveBeenCalledWith('b')
      })
    })
  }

  it('shows the preview from the keyboard too, without opening the editor', () => {
    render({ touch: false, narrow: true })
    act(() => { card('Car park loop')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })) })
    expect(previewed()).toBe('b')
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('returns to the desktop\'s two panes when the window widens', () => {
    render({ touch: true, narrow: true })
    tap(card('Car park loop')!)
    render({ touch: true, narrow: false })
    expect(card('Night patrol')).not.toBeNull()
    expect(previewed()).toBe('b')
    expect(backButton()).toBeNull()
  })
})
