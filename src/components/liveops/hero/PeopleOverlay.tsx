import { useLayoutEffect, useRef, useState } from 'react'
import { color, font } from '@/design-system/tokens'
import { contentRect, drawPeople } from '@/liveops/people'
import type { PeopleFrame } from '@/types'

interface Sizes { pane: { width: number; height: number }; media: { width: number; height: number } }

const sameSizes = (a: Sizes | null, b: Sizes) =>
  !!a && a.pane.width === b.pane.width && a.pane.height === b.pane.height
  && a.media.width === b.media.width && a.media.height === b.media.height

/** The pane's size and the picture's own, read off the DOM: the overlay sits
 * in the same pane as the <video> or <img>, which carries its intrinsic size. */
function measure(pane: HTMLElement): Sizes {
  const media = pane.querySelector('video, img')
  const width = media instanceof HTMLVideoElement ? media.videoWidth : media instanceof HTMLImageElement ? media.naturalWidth : 0
  const height = media instanceof HTMLVideoElement ? media.videoHeight : media instanceof HTMLImageElement ? media.naturalHeight : 0
  return { pane: { width: pane.clientWidth, height: pane.clientHeight }, media: { width, height } }
}

/**
 * The people perception sees (perception/people, schema 0.0.38), drawn over
 * the front camera: a box with "person 92%" for each, and the COCO-17 skeleton
 * when the robot sends keypoints. Placed on the picture itself, not the pane:
 * the frame is fitted as the video is (`fit`, letterboxed by 'contain', cropped
 * by 'cover') and zoomed by Steady's crop (`zoom`). Steady's per-frame shift is
 * not followed, so a steadied picture can sit a little off the boxes.
 *
 * Never takes a click: everything under it (the video, the corner controls)
 * keeps working.
 */
export function PeopleOverlay({ frame, fit, zoom = 1 }: { frame: PeopleFrame; fit: 'contain' | 'cover'; zoom?: number }) {
  const ref = useRef<SVGSVGElement>(null)
  const [sizes, setSizes] = useState<Sizes | null>(null)

  // Re-measured with each frame (the stream can change size) and when the
  // pane resizes.
  useLayoutEffect(() => {
    const pane = ref.current?.parentElement
    if (!pane) return
    const next = measure(pane)
    setSizes((prev) => (sameSizes(prev, next) ? prev : next))
  }, [frame])
  useLayoutEffect(() => {
    const pane = ref.current?.parentElement
    if (!pane || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      const next = measure(pane)
      setSizes((prev) => (sameSizes(prev, next) ? prev : next))
    })
    ro.observe(pane)
    return () => ro.disconnect()
  }, [])

  const rect = sizes ? contentRect(sizes.pane, sizes.media, fit, zoom) : null
  const people = rect ? drawPeople(frame.people, rect) : []

  return (
    <svg
      ref={ref}
      data-testid="people-overlay"
      aria-hidden
      width="100%" height="100%"
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1, overflow: 'hidden' }}
    >
      {people.map((p) => (
        <g key={p.key} data-person="">
          <rect
            x={p.box.x} y={p.box.y} width={p.box.width} height={p.box.height} rx={4}
            fill="none" stroke={color.accent} strokeWidth={2}
          />
          {p.limbs.map(([x1, y1, x2, y2], i) => (
            <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={color.accent} strokeWidth={2.5} strokeLinecap="round" />
          ))}
          {p.joints.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={2.5} fill={color.accentText} stroke={color.accent} strokeWidth={1.5} />)}
          <g transform={`translate(${p.box.x}, ${Math.max(0, p.box.y - 20)})`}>
            <rect width={label(p).length * 6.6 + 12} height={18} rx={4} fill={color.accentSolid} />
            <text x={6} y={13} fill={color.accentText} fontFamily={font.family} fontSize={11} fontWeight={600}>{label(p)}</text>
          </g>
        </g>
      ))}
    </svg>
  )
}

const label = (p: { label: string; confidence: number }) => `${p.label} ${Math.round(p.confidence * 100)}%`
