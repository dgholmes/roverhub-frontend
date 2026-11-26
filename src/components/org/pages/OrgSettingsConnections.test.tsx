// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'

/** Settings › Connections must not tell operators to hand-edit the video map. */

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('@/lib/edgeVideo', () => ({ PER_ROBOT_URLS: {}, GLOBAL_URL: '' }))
vi.mock('../settingsSection', () => ({ takeRequestedSettingsSection: () => 'connections' }))

import { OrgSettingsPage } from './OrgSettingsPage'

let host: HTMLDivElement
let root: Root

beforeAll(async () => { await i18n.changeLanguage('en') })
beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(async () => {
  act(() => root.unmount())
  host.remove()
  await i18n.changeLanguage('en')
})

describe('Settings › Connections › camera relays', () => {
  it('says robots report their own address when no overrides are set', () => {
    act(() => root.render(<OrgSettingsPage />))
    expect(host.textContent).toContain('No overrides are set in this console')
    expect(host.textContent).not.toContain('Set VITE_EDGE_VIDEO_BASE_URLS')
  })

  it('reads in Korean too', async () => {
    await i18n.changeLanguage('ko')
    act(() => root.render(<OrgSettingsPage />))
    expect(host.textContent).toContain('재정의 항목이 없습니다')
    expect(host.textContent).not.toContain('설정하세요')
  })
})
