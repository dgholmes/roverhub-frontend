import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import '@/i18n'
import type { RobotState } from '@/types'
import { currentOperatorId } from '@/lib/realtime/operator'
import { CameraModeTabs } from '@/components/liveops/feed/CameraModeTabs'

// Which stream a pane asks the edge device for, given the viewer's Steady
// switch, whether they are driving, and whether the device already steadies
// that camera (VIDEO_STABILISE). The steadied stream is used as it is only when
// the viewer would have used lookahead; otherwise the raw one (?raw=1). The
// rules themselves are in lib/stabilise/steadyPlan.test.ts; this pins that the
// pane passes them through to the WebRTC request.

const calls = vi.hoisted(() => ({ raw: [] as (boolean | undefined)[] }))
vi.mock('@/lib/edgeVideo', () => ({ edgeVideoFor: () => ({ url: 'http://edge:8090', source: 'global' }) }))
vi.mock('@/lib/useWebRtcVideo', () => ({
  useWebRtcVideo: (_base: string, _camera: string, _enabled: boolean, raw?: boolean) => {
    calls.raw.push(raw)
    return { status: 'idle', stream: null, servesWebRtc: false }
  },
}))

import { CameraFeedLayer } from './CameraFeedLayer'

const robot = (opts: { steadied?: ('front' | 'back')[]; driving?: boolean } = {}) => ({
  robot_id: 'r1',
  name: 'Rover 1',
  connectivity: { dds: 'connected' },
  control_owner: opts.driving ? currentOperatorId() : null,
  bridge: { stabilised_cameras: opts.steadied ?? [] },
} as unknown as RobotState)

const rawRequested = (r: RobotState, steady: boolean) => {
  calls.raw = []
  renderToStaticMarkup(<CameraFeedLayer robot={r} facing="front" steady={steady} />)
  return calls.raw[calls.raw.length - 1]
}

// A server render reads the store's initial state (Steady on), so the switch
// turned off is covered by steadyPlan.test.ts and the in-browser check, not here.
describe('CameraFeedLayer and Steady', () => {
  it('takes a steadying edge device\'s stream while the viewer watches', () => {
    expect(rawRequested(robot({ steadied: ['front'] }), true)).toBe(false)
  })

  it('asks for the raw stream when the viewer drives, or the pane is not steadied', () => {
    expect(rawRequested(robot({ steadied: ['front'], driving: true }), true)).toBe(true)
    expect(rawRequested(robot({ steadied: ['front'] }), false)).toBe(true)
  })

  it('never asks for raw from a device that steadies nothing', () => {
    expect(rawRequested(robot(), true)).toBe(false)
    expect(rawRequested(robot({ steadied: ['back'] }), false)).toBe(false)
  })
})

describe('CameraModeTabs Steady switch', () => {
  const tabs = (extra: { steady?: boolean; onSteadyChange?: (s: boolean) => void }) => renderToStaticMarkup(
    <CameraModeTabs
      mode="rgb" onChange={() => {}} ddsAvailable facing="front" onFacingChange={() => {}}
      fit="fit" onFitChange={() => {}} {...extra}
    />,
  )

  it('shows the switch with its state when the pane offers it', () => {
    const on = tabs({ steady: true, onSteadyChange: () => {} })
    expect(on).toMatch(/aria-pressed="true"[^>]*>.*Steady/s)
    expect(tabs({ steady: false, onSteadyChange: () => {} })).toContain('Steady is off')
  })

  it('leaves the switch out where the pane does not offer it', () => {
    expect(tabs({})).not.toContain('Steady')
  })
})
