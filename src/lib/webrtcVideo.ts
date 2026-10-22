/**
 * WebRTC playback of the robot's own H.264 camera stream.
 *
 * Since Dobot SDK v1.3.0 the robot encodes its cameras itself and serves RTSP.
 * On an edge device running with `VIDEO_SOURCE=rtsp`, go2rtc relays that to the
 * browser as WebRTC, and the bridge forwards the handshake on the same port the
 * MJPEG relay uses: `POST {base}/video/{camera}/webrtc`, SDP offer in, SDP
 * answer out (roverhub-edge `robot_bridge/video_relay.py`). The media then flows
 * from go2rtc to the browser directly.
 *
 * Unlike the MJPEG relay this does not depend on the robot's DDS link, which is
 * why the feed components stop showing their "DDS paused" overlays over it.
 *
 * A bridge still in `VIDEO_SOURCE=dds` mode has no such endpoint, so the attempt
 * fails and the feed keeps its MJPEG `<img>` -- both modes work with one frontend
 * config (`VITE_EDGE_VIDEO_BASE_URLS`).
 */

/** How long to wait between attempts after one fails, or after a live session
 * drops. A dds-mode bridge costs one rejected POST per interval. */
export const WEBRTC_RETRY_MS = 10_000
/** Give up on an attempt that has not produced a track by then. */
export const WEBRTC_CONNECT_TIMEOUT_MS = 10_000
/** Our offer is sent once ICE gathering completes (no trickle -- the endpoint is
 * one request/response), or after this, whichever is first. On a LAN gathering
 * finishes in tens of milliseconds. */
const ICE_GATHER_TIMEOUT_MS = 1_500

export type WebRtcStatus = 'idle' | 'connecting' | 'live' | 'failed'

export function webrtcOfferUrl(baseUrl: string, camera: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/video/${encodeURIComponent(camera)}/webrtc`
}

/** Which element the feed should render. WebRTC wins whenever it is live; until
 * then (connecting, failed, or a bridge that does not offer it) the MJPEG relay
 * is used if it is allowed at all. Pure so it can be tested in node. */
export function choosePlayback(
  webrtc: WebRtcStatus,
  mjpegAllowed: boolean,
): 'webrtc' | 'mjpeg' | 'none' {
  if (webrtc === 'live') return 'webrtc'
  return mjpegAllowed ? 'mjpeg' : 'none'
}

export interface WebRtcSession {
  stream: MediaStream
  close: () => void
}

function waitForIceGathering(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve()
  return new Promise((resolve) => {
    const done = () => {
      pc.removeEventListener('icegatheringstatechange', check)
      clearTimeout(timer)
      resolve()
    }
    const check = () => { if (pc.iceGatheringState === 'complete') done() }
    const timer = setTimeout(done, ICE_GATHER_TIMEOUT_MS)
    pc.addEventListener('icegatheringstatechange', check)
  })
}

/**
 * Opens a receive-only WebRTC session for one camera. Resolves once a video
 * track arrives; rejects on a refused handshake or timeout. `onDrop` fires if an
 * established session later fails (robot powered off, link pulled) -- the caller
 * then closes it and retries.
 */
export async function openWebRtcStream(
  baseUrl: string,
  camera: string,
  onDrop: () => void,
): Promise<WebRtcSession> {
  const pc = new RTCPeerConnection()
  const close = () => pc.close()
  try {
    pc.addTransceiver('video', { direction: 'recvonly' })
    const track = new Promise<MediaStream>((resolve) => {
      pc.addEventListener('track', (e) => resolve(e.streams[0] ?? new MediaStream([e.track])))
    })
    await pc.setLocalDescription(await pc.createOffer())
    await waitForIceGathering(pc)

    // text/plain keeps this a CORS "simple request": no preflight round trip.
    const res = await fetch(webrtcOfferUrl(baseUrl, camera), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: pc.localDescription?.sdp ?? '',
    })
    if (!res.ok) throw new Error(`WebRTC offer refused: HTTP ${res.status}`)
    await pc.setRemoteDescription({ type: 'answer', sdp: await res.text() })

    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('WebRTC: no video within timeout')), WEBRTC_CONNECT_TIMEOUT_MS)
    })
    const stream = await Promise.race([track, timeout]).finally(() => clearTimeout(timer))

    pc.addEventListener('connectionstatechange', () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') onDrop()
    })
    return { stream, close }
  } catch (err) {
    close()
    throw err
  }
}
