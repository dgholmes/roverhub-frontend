import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import '@/i18n'
import type { RobotState } from '@/types'

// The small camera (map inset, Cockpit picture-in-picture) resolves its edge
// device the same way the hero does: an env override for the robot first, then
// the url the robot's bridge advertises in its registration (0.0.34).

const relay = vi.hoisted(() => ({ perRobot: {} as Record<string, string> }))
vi.mock('@/lib/edgeVideo', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/edgeVideo')>()
  return {
    ...actual,
    edgeVideoFor: (robotId: string, advertised?: string | null) =>
      actual.edgeVideoFor(robotId, advertised, { perRobot: relay.perRobot, global: undefined }),
  }
})
vi.mock('@/lib/useWebRtcVideo', () => ({
  useWebRtcVideo: () => ({ status: 'idle', stream: null, servesWebRtc: false }),
}))

import { CameraThumb } from './CameraThumb'

const robot = (videoBaseUrl?: string) => ({
  robot_id: 'r1',
  name: 'Rover 1',
  connectivity: { dds: 'connected' },
  bridge: videoBaseUrl === undefined ? undefined : { video_base_url: videoBaseUrl },
} as unknown as RobotState)

const render = (r: RobotState) => renderToStaticMarkup(<CameraThumb robot={r} facing="front" width={160} height={90} />)

describe('CameraThumb', () => {
  beforeEach(() => { relay.perRobot = {} })

  it('plays the video from the url the robot advertises when no env override names it', () => {
    expect(render(robot('http://10.0.12.101:8090'))).toContain('http://10.0.12.101:8090/video/front')
  })

  it('keeps the env override for the robot over the url it advertises', () => {
    relay.perRobot = { r1: 'http://10.0.12.4:8090' }

    const html = render(robot('http://10.0.12.101:8090'))

    expect(html).toContain('http://10.0.12.4:8090/video/front')
    expect(html).not.toContain('10.0.12.101')
  })

  it('says there is no feed when nothing is configured or advertised', () => {
    const html = render(robot())

    expect(html).not.toContain('/video/front')
    expect(html).toContain('No camera feed')
  })
})
