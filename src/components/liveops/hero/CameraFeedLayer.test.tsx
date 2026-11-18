import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import '@/i18n'
import type { RobotState } from '@/types'

// The hero camera plane decides, from the same `choosePlayback` verdict the
// thumbnail uses, whether there is a picture at all. What is pinned here is
// that when the verdict is 'none' the operator is shown an explicit "no feed"
// plate -- never the decorative ./live_view.png, which is a photograph of a
// corridor and reads exactly like a live camera once the HUD is drawn over it.
// Audit 2026-11-18 §4.1.

const relay = vi.hoisted(() => ({ baseUrl: undefined as string | undefined }))
vi.mock('@/lib/edgeVideo', () => ({
  edgeVideoBaseUrlFor: () => relay.baseUrl,
}))
vi.mock('@/lib/useWebRtcVideo', () => ({
  useWebRtcVideo: () => ({ status: 'idle', stream: null, servesWebRtc: false }),
}))

import { CameraFeedLayer } from './CameraFeedLayer'

const robotWith = (dds: RobotState['connectivity']['dds']) => ({
  robot_id: 'r1',
  name: 'Rover 1',
  connectivity: { dds },
} as RobotState)

const render = (dds: RobotState['connectivity']['dds'] = 'connected') =>
  renderToStaticMarkup(<CameraFeedLayer robot={robotWith(dds)} facing="front" />)

describe('CameraFeedLayer', () => {
  beforeEach(() => { relay.baseUrl = undefined })

  it('never shows the decorative placeholder photo when there is no feed', () => {
    const html = render('connected')

    expect(html).not.toContain('live_view.png')
  })

  it('says there is no camera feed when no relay is configured for the robot', () => {
    const html = render('connected')

    expect(html).toContain('No camera feed')
  })

  it('says there is no camera feed when the robot has no DDS link', () => {
    relay.baseUrl = 'http://10.0.12.4:8090'

    const html = render('unavailable')

    expect(html).toContain('No camera feed')
    expect(html).not.toContain('live_view.png')
  })

  it('does not claim a last frame is on screen when no frame ever arrived', () => {
    relay.baseUrl = 'http://10.0.12.4:8090'

    const html = render('unavailable')

    expect(html).toContain('Feed paused')
    expect(html).not.toContain('Showing last received frame')
  })

  it('still renders the real relay stream when the feed is live', () => {
    relay.baseUrl = 'http://10.0.12.4:8090'

    const html = render('connected')

    expect(html).toContain('http://10.0.12.4:8090/video/front')
    expect(html).not.toContain('No camera feed')
  })
})
