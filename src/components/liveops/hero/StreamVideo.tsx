import { useEffect, useRef, type CSSProperties } from 'react'

/** A `<video>` bound to a MediaStream. `srcObject` has no JSX attribute, so it
 * is set through a ref. Muted + playsInline are what let browsers autoplay it. */
export function StreamVideo(
  { stream, style, ariaLabel }: { stream: MediaStream; style?: CSSProperties; ariaLabel?: string },
) {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.srcObject = stream
    // play() rejects if the element is torn down first; nothing to do about it.
    el.play().catch(() => {})
    return () => { el.srcObject = null }
  }, [stream])
  return <video ref={ref} muted autoPlay playsInline aria-label={ariaLabel} style={style} />
}
