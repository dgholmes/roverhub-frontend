import { useEffect, useRef, useState, type CSSProperties } from 'react'

/** A `<video>` bound to a MediaStream. `srcObject` has no JSX attribute, so it
 * is set through a ref. Muted + playsInline are what let browsers autoplay it.
 *
 * Kept transparent until the first frame is actually playing: a video element
 * with a stream but no decoded frame yet paints solid black, which is what made
 * a robot switch flash black before the picture arrived. `onPlaying` lets the
 * parent keep its loading indicator up until then. */
export function StreamVideo(
  { stream, style, ariaLabel, onPlaying }:
  { stream: MediaStream; style?: CSSProperties; ariaLabel?: string; onPlaying?: (playing: boolean) => void },
) {
  const ref = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  const onPlayingRef = useRef(onPlaying)
  onPlayingRef.current = onPlaying
  useEffect(() => {
    const el = ref.current
    if (!el) return
    setPlaying(false)
    onPlayingRef.current?.(false)
    el.srcObject = stream
    // play() rejects if the element is torn down first; nothing to do about it.
    el.play().catch(() => {})
    return () => { el.srcObject = null }
  }, [stream])
  return (
    <video
      ref={ref} muted autoPlay playsInline aria-label={ariaLabel}
      onPlaying={() => { setPlaying(true); onPlayingRef.current?.(true) }}
      style={{ ...style, opacity: playing ? 1 : 0, transition: 'opacity 120ms linear' }}
    />
  )
}
