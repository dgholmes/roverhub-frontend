// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { mockMaps } from '@/mocks/maps'
import type { RobotState } from '@/types'
import type { SiteMap } from '@/types/maps'
import { NewMissionMapChooser } from './NewMissionMapChooser'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const base: SiteMap = mockMaps[0]
const office: SiteMap = { ...base, map_id: 'map-office', name: 'Office 3F' }
const carPark: SiteMap = { ...base, map_id: 'map-car-park', name: 'Car park B1' }
const draft: SiteMap = { ...base, map_id: 'map-4f', name: 'Office 4F', status: 'draft' }
const robots = [{ robot_id: 'rover-pi', name: 'rover-pi', bridge: { nav_map_id: carPark.map_id } }] as unknown as RobotState[]

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

const radios = () => [...host.querySelectorAll<HTMLInputElement>('input[type="radio"]')]
const radioFor = (name: string) => radios().find((r) => r.closest('label')?.textContent?.includes(name))!
const button = (text: string) => [...host.querySelectorAll('button')].find((b) => b.textContent === text)!

function render(props: Partial<Parameters<typeof NewMissionMapChooser>[0]> = {}) {
  const onStart = vi.fn()
  const onCancel = vi.fn()
  act(() => root.render(
    <NewMissionMapChooser maps={[office, carPark, draft]} robots={robots} defaultMapId={carPark.map_id} onStart={onStart} onCancel={onCancel} {...props} />,
  ))
  return { onStart, onCancel }
}

describe('New mission: which map?', () => {
  it('is a named dialog with one labelled radio per map, the default ticked and focused', () => {
    render()
    const dialog = host.querySelector('[role="alertdialog"]')!
    expect(dialog.getAttribute('aria-label')).toBe(i18n.t('missions.library.chooser.title'))
    expect(host.querySelector('[role="radiogroup"]')).not.toBeNull()
    expect(radios()).toHaveLength(3)
    expect(radioFor('Car park B1').checked).toBe(true)
    expect(document.activeElement).toBe(radioFor('Car park B1'))
  })

  it("names the robots on each map", () => {
    render()
    expect(radioFor('Car park B1').closest('label')!.textContent).toContain('rover-pi')
  })

  it('shows a draft map but does not let it be chosen, and says why', () => {
    render()
    const r = radioFor('Office 4F')
    expect(r.disabled).toBe(true)
    expect(r.closest('label')!.textContent).toContain(i18n.t('missions.library.chooser.draft'))
  })

  it('starts drawing on the map picked', () => {
    const { onStart } = render()
    act(() => radioFor('Office 3F').click())
    act(() => button(i18n.t('missions.library.chooser.start')).click())
    expect(onStart).toHaveBeenCalledWith(office.map_id)
  })

  it('closes on Cancel and on Escape, starting nothing', () => {
    const { onStart, onCancel } = render()
    act(() => button(i18n.t('missions.library.chooser.cancel')).click())
    act(() => { host.querySelector('[role="alertdialog"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
    expect(onCancel).toHaveBeenCalledTimes(2)
    expect(onStart).not.toHaveBeenCalled()
  })

  it('cannot start with no active map, and says so', () => {
    const { onStart } = render({ maps: [draft, { ...carPark, status: 'archived' }], defaultMapId: null })
    expect(button(i18n.t('missions.library.chooser.start')).disabled).toBe(true)
    expect(host.textContent).toContain(i18n.t('missions.library.chooser.noActive'))
    expect(radios().every((r) => r.disabled)).toBe(true)
    expect(onStart).not.toHaveBeenCalled()
  })
})
