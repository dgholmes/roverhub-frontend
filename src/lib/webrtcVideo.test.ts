import { describe, expect, it } from 'vitest'
import { choosePlayback, webrtcOfferUrl } from './webrtcVideo'

describe('webrtcOfferUrl', () => {
  it('appends the bridge handshake path to the edge base URL', () => {
    expect(webrtcOfferUrl('http://10.0.12.4:8090', 'front')).toBe('http://10.0.12.4:8090/video/front/webrtc')
  })

  it('tolerates a trailing slash and escapes the camera name', () => {
    expect(webrtcOfferUrl('http://h:8090/', 'a b')).toBe('http://h:8090/video/a%20b/webrtc')
  })
})

describe('choosePlayback', () => {
  it('prefers WebRTC whenever it is live, even with DDS down', () => {
    expect(choosePlayback('live', false)).toBe('webrtc')
    expect(choosePlayback('live', true)).toBe('webrtc')
  })

  it('shows a pending state, not the MJPEG fallback, while a first attempt connects', () => {
    // Falling back during the handshake made a robot switch flash the
    // placeholder image, then black, then the camera.
    expect(choosePlayback('connecting', true)).toBe('pending')
    expect(choosePlayback('connecting', false)).toBe('pending')
  })

  it('falls back to MJPEG once WebRTC has failed on a device never seen serving it', () => {
    // A dds-mode bridge never answers the handshake; it must still show video,
    // and must not flicker back to pending on every retry.
    for (const status of ['failed', 'retrying'] as const) {
      expect(choosePlayback(status, true)).toBe('mjpeg')
      expect(choosePlayback(status, false)).toBe('none')
    }
  })

  it('waits on WebRTC for a device known to serve it, even after a drop', () => {
    for (const status of ['failed', 'retrying'] as const) {
      expect(choosePlayback(status, true, true)).toBe('pending')
    }
  })

  it('uses MJPEG or nothing when WebRTC is not being attempted', () => {
    expect(choosePlayback('idle', true)).toBe('mjpeg')
    expect(choosePlayback('idle', false)).toBe('none')
    expect(choosePlayback('idle', true, true)).toBe('mjpeg')
  })
})
