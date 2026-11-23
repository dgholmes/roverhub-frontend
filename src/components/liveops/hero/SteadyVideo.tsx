import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { EST_WIDTH, MotionEstimator, greyFromRgba } from '@/lib/stabilise/motion'
import { PathSmoother, type Correction, type PushResult } from '@/lib/stabilise/pathSmoother'
import { LOOKAHEAD_FRAMES } from '@/lib/stabilise/steadyPlan'
import { correctionMatrix } from '@/lib/stabilise/transform'
import { StreamVideo } from './StreamVideo'

/** Share of width and height zoomed away so a moved edge stays out of view.
 * The prototype's measured choice: 12 % was no better on this gait. */
export const STEADY_CROP = 0.08
/** The robot's RTSP cameras run at 15 fps; the smoother's cutoffs are set in
 * frames at that rate. */
const STREAM_FPS = 15
/** How often the per-frame cost is written to `data-steady-ms`. */
const COST_EVERY = 30

/** Whether this browser can steady a stream: it needs to be told about each
 * decoded frame (requestVideoFrameCallback) and to hold one (VideoFrame).
 * Chrome, Edge and Safari 16.4+ can; elsewhere the plain video is shown. */
export function canSteady(): boolean {
  return typeof HTMLVideoElement !== 'undefined'
    && 'requestVideoFrameCallback' in HTMLVideoElement.prototype
    && typeof VideoFrame !== 'undefined'
}

/**
 * A MediaStream shown steadied: the robot's gait shake smoothed out, in this
 * viewer's browser only.
 *
 * The <video> keeps playing underneath. For each frame it decodes, a 320 px
 * grey copy goes to the motion estimator, the frame itself is held as a
 * VideoFrame, and the smoother says which frame to show now and how far to
 * shift and roll it. That frame is drawn onto the canvas on top. With
 * `smoothing="lookahead"` the canvas runs LOOKAHEAD_FRAMES behind the stream
 * (+267 ms); with `"causal"` it shows each frame as it arrives. Switching
 * between them keeps the stream and the estimate: lookahead -> causal jumps
 * forward once, causal -> lookahead holds still while the delay builds up.
 *
 * Until the first steadied frame the plain video shows through, so starting
 * never blanks the picture. The average cost per frame (estimate + draw) is
 * kept in the canvas's `data-steady-ms`, for measuring in a real session.
 */
export function SteadyVideo(
  { stream, smoothing, style, ariaLabel, onPlaying }:
  {
    stream: MediaStream
    smoothing: 'causal' | 'lookahead'
    style?: CSSProperties
    ariaLabel?: string
    onPlaying?: (playing: boolean) => void
  },
) {
  const supported = useState(canSteady)[0]
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [playing, setPlaying] = useState(false)
  const onPlayingRef = useRef(onPlaying)
  onPlayingRef.current = onPlaying
  const lookahead = smoothing === 'lookahead' ? LOOKAHEAD_FRAMES : 0
  const lookaheadRef = useRef(lookahead)
  lookaheadRef.current = lookahead
  const smootherRef = useRef<PathSmoother<VideoFrame> | null>(null)
  const showRef = useRef<((r: PushResult<VideoFrame>) => void) | null>(null)

  useEffect(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!supported || !video || !canvas) return
    const ctx = canvas.getContext('2d')
    const small = document.createElement('canvas')
    const sctx = small.getContext('2d', { willReadFrequently: true })
    if (!ctx || !sctx) return

    setPlaying(false)
    onPlayingRef.current?.(false)
    video.srcObject = stream
    // play() rejects if the element is torn down first; nothing to do about it.
    video.play().catch(() => {})

    let estimator = new MotionEstimator()
    let smoother: PathSmoother<VideoFrame> | null = null
    let w = 0, h = 0, eh = 0
    let handle = 0
    let stopped = false
    let costSum = 0, costCount = 0

    const draw = (frame: VideoFrame, c: Correction) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, w, h)
      ctx.setTransform(...correctionMatrix(c, w, h, STEADY_CROP, w / EST_WIDTH))
      ctx.drawImage(frame, 0, 0, w, h)
      ctx.setTransform(1, 0, 0, 1, 0, 0)
    }
    let shownAny = false
    const show = (r: PushResult<VideoFrame>) => {
      for (const f of r.dropped) f.close()
      for (const e of r.emit) {
        draw(e.item, e.correction)
        e.item.close()
        if (!shownAny) {
          shownAny = true
          canvas.style.opacity = '1'
        }
      }
    }
    showRef.current = show

    const onFrame = () => {
      if (stopped) return
      const t0 = performance.now()
      const vw = video.videoWidth, vh = video.videoHeight
      if (vw > 0 && vh > 0) {
        if (vw !== w || vh !== h) {
          // A new resolution: start over, the old path means nothing now.
          smoother?.reset().forEach((f) => f.close())
          w = vw; h = vh; eh = Math.max(16, Math.round((EST_WIDTH * vh) / vw))
          canvas.width = w; canvas.height = h
          small.width = EST_WIDTH; small.height = eh
          estimator = new MotionEstimator()
          smoother = new PathSmoother<VideoFrame>({
            fps: STREAM_FPS, lookahead: lookaheadRef.current, width: EST_WIDTH, height: eh, crop: STEADY_CROP,
          })
          smootherRef.current = smoother
        }
        sctx.drawImage(video, 0, 0, EST_WIDTH, eh)
        const motion = estimator.step(greyFromRgba(sctx.getImageData(0, 0, EST_WIDTH, eh).data, EST_WIDTH, eh))
        let frame: VideoFrame | null = null
        try { frame = new VideoFrame(video) } catch { frame = null }
        if (frame && smoother) show(smoother.push(motion, frame))
        costSum += performance.now() - t0
        if (++costCount >= COST_EVERY) {
          canvas.dataset.steadyMs = (costSum / costCount).toFixed(2)
          costSum = 0; costCount = 0
        }
      }
      handle = video.requestVideoFrameCallback(onFrame)
    }
    handle = video.requestVideoFrameCallback(onFrame)

    return () => {
      stopped = true
      video.cancelVideoFrameCallback(handle)
      smoother?.reset().forEach((f) => f.close())
      smootherRef.current = null
      showRef.current = null
      canvas.style.opacity = '0'
      video.srcObject = null
    }
  }, [stream, supported])

  // Taking or releasing control changes the delay, not the stream.
  useEffect(() => {
    const s = smootherRef.current
    if (s) showRef.current?.(s.setLookahead(lookahead))
  }, [lookahead])

  if (!supported) return <StreamVideo stream={stream} style={style} ariaLabel={ariaLabel} onPlaying={onPlaying} />

  return (
    <>
      <video
        ref={videoRef} muted autoPlay playsInline aria-label={ariaLabel}
        onPlaying={() => { setPlaying(true); onPlayingRef.current?.(true) }}
        style={{ ...style, opacity: playing ? 1 : 0, transition: 'opacity 120ms linear' }}
      />
      <canvas
        ref={canvasRef}
        data-steady={smoothing}
        aria-hidden
        style={{ ...style, opacity: 0, pointerEvents: 'none' }}
      />
    </>
  )
}
