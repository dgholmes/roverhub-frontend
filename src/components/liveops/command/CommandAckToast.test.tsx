// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import i18n from '@/i18n'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'
import type { Command } from '@/types'
import { CommandAckToast } from './CommandAckToast'

const failed = (failure_reason: string): Command => ({
  command_id: 'c1', robot_id: 'r1', type: 'NAV_GOTO', label: 'Walk to point',
  stages: [{ stage: 'execution_failed', at: '2026-11-11T00:00:00Z' }], current_stage: 'execution_failed',
  initiated_by: 'operator-dev', failure_reason,
} as Command)

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/** Rendered for real: zustand serves a server render its initial state. */
function renderToStaticMarkup(node: React.ReactNode): string {
  const host = document.createElement('div')
  const root = createRoot(host)
  act(() => root.render(node))
  const html = host.innerHTML
  act(() => root.unmount())
  return html
}
const visibleText = (html: string) => html.replace(/<[^>]+>/g, '').replace(/&#x27;|&apos;/g, "'")

afterEach(() => useLiveOpsStore.setState({ activeCommands: [] }))

describe('a refused command on the toast', () => {
  it('says why in words, keeping the raw reason as the title', () => {
    const raw = "REJECTED_NAV_MAP_MISMATCH: the point is on map 'a' but this robot is on 'b'"
    useLiveOpsStore.setState({ activeCommands: [failed(raw)] })
    const html = renderToStaticMarkup(<CommandAckToast />)
    expect(visibleText(html)).toContain(i18n.t('command.refusal.code.REJECTED_NAV_MAP_MISMATCH'))
    expect(visibleText(html)).not.toContain('REJECTED_')
    expect(html).toContain('title="REJECTED_NAV_MAP_MISMATCH')
  })

  it('falls back to a generic line for an unknown code, with the code still shown', () => {
    useLiveOpsStore.setState({ activeCommands: [failed('REJECTED_BRAND_NEW: why')] })
    const text = visibleText(renderToStaticMarkup(<CommandAckToast />))
    expect(text).toContain(i18n.t('command.refusal.unknown'))
    expect(text).toContain('REJECTED_BRAND_NEW')
  })
})
