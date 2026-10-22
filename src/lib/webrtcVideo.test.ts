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

  it('keeps the MJPEG relay while WebRTC is connecting or unavailable', () => {
    // A dds-mode bridge never answers the WebRTC handshake; it must look exactly
    // as it did before WebRTC existed.
    for (const status of ['idle', 'connecting', 'failed'] as const) {
      expect(choosePlayback(status, true)).toBe('mjpeg')
      expect(choosePlayback(status, false)).toBe('none')
    }
  })
})
