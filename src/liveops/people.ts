import type { Detection, PeopleFrame } from '@/types'

/**
 * The people perception sees, drawn over the front camera (perception/people,
 * schema 0.0.38): what a payload must be to be drawn, which frames are kept,
 * and where a normalised box lands on the picture. PeopleOverlay draws it;
 * the providers deliver it through PeopleFeed.
 *
 * Timing is judged on this browser's clock (when a frame arrived), as for the
 * live scan and the planned route: the robot's clock is not the browser's.
 * The robot's own `at` only orders frames -- one older than the newest kept by
 * more than PEOPLE_MAX_AGE_MS is late and dropped.
 */

/** A frame this much older than the newest one kept is dropped. */
export const PEOPLE_MAX_AGE_MS = 1000
/** No frame for this long: the overlay clears, and the robot counts as not
 * sending people (detection off, or a bridge older than 0.0.38). */
export const PEOPLE_CLEAR_MS = 1500
/** Keypoints less sure than this are not drawn, nor the limbs they end. */
export const KEYPOINT_MIN_CONF = 0.3

/** The COCO-17 limbs, by keypoint index: face, arms, torso, legs. */
export const COCO_SKELETON: readonly (readonly [number, number])[] = [
  [0, 1], [0, 2], [1, 3], [2, 4],
  [5, 7], [7, 9], [6, 8], [8, 10],
  [5, 6], [5, 11], [6, 12], [11, 12],
  [11, 13], [13, 15], [12, 14], [14, 16],
]

export interface PeopleSample {
  frame: PeopleFrame
  /** When THIS browser received it. */
  receivedAt: number
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const unit = (v: unknown): v is number => finite(v) && v >= -0.01 && v <= 1.01

/** One person, or null when anything about it is off (a box outside the
 * frame, a confidence that is not 0..1). Keypoints that are malformed are
 * dropped -- the box is still drawn -- rather than the person. */
function parsePerson(raw: unknown): Detection | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const d = raw as Record<string, unknown>
  if (typeof d.label !== 'string' || !finite(d.confidence) || d.confidence < 0 || d.confidence > 1) return null
  const b = d.bbox
  if (!Array.isArray(b) || b.length !== 4 || !b.every(unit)) return null
  let keypoints: Detection['keypoints'] = null
  if (Array.isArray(d.keypoints) && d.keypoints.every((k) => Array.isArray(k) && k.length === 3 && k.every(finite))) {
    keypoints = (d.keypoints as [number, number, number][]).map(([x, y, c]) => [x, y, c])
  }
  return {
    label: d.label,
    confidence: d.confidence,
    bbox: [b[0], b[1], b[2], b[3]],
    camera: typeof d.camera === 'string' ? d.camera : '',
    model: typeof d.model === 'string' ? d.model : '',
    track_id: typeof d.track_id === 'string' ? d.track_id : null,
    keypoints,
  }
}

/** A perception/people payload (already JSON-parsed) as a PeopleFrame, or
 * null when it is not one. A malformed person is left out, not the frame. */
export function parsePeopleFrame(raw: unknown): PeopleFrame | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const f = raw as Record<string, unknown>
  if (typeof f.robot_id !== 'string' || !f.robot_id || typeof f.at !== 'string') return null
  if (!Array.isArray(f.people)) return null
  return {
    robot_id: f.robot_id,
    site_id: typeof f.site_id === 'string' ? f.site_id : '',
    camera: typeof f.camera === 'string' ? f.camera : 'front',
    at: f.at,
    people: f.people.map(parsePerson).filter((p): p is Detection => p !== null),
  }
}

type Listener = (sample: PeopleSample) => void

/**
 * Each robot's latest people frame and who wants it. Both providers hold one:
 * the real one feeds it from the broker, the mock from its walking people. A
 * new subscriber gets the latest sample at once; whether it is still worth
 * drawing is peopleToDraw's call.
 */
export class PeopleFeed {
  private latest = new Map<string, PeopleSample>()
  private listeners = new Map<string, Set<Listener>>()

  subscribe(robotId: string, listener: Listener): () => void {
    let set = this.listeners.get(robotId)
    if (!set) this.listeners.set(robotId, (set = new Set()))
    const listeners = set
    listeners.add(listener)
    const latest = this.latest.get(robotId)
    if (latest) listener(latest)
    return () => {
      listeners.delete(listener)
      if (listeners.size === 0 && this.listeners.get(robotId) === listeners) this.listeners.delete(robotId)
    }
  }

  /** Whether anyone is listening for this robot (the mock only walks people
   * for a robot on screen). */
  watched(robotId: string): boolean {
    return (this.listeners.get(robotId)?.size ?? 0) > 0
  }

  /** A frame, stamped with when this browser received it. A frame more than
   * PEOPLE_MAX_AGE_MS older than the newest kept is late, and dropped. */
  push(frame: PeopleFrame, receivedAt = Date.now()): void {
    const prev = this.latest.get(frame.robot_id)
    const at = Date.parse(frame.at)
    const prevAt = prev ? Date.parse(prev.frame.at) : NaN
    if (Number.isFinite(at) && Number.isFinite(prevAt) && prevAt - at > PEOPLE_MAX_AGE_MS) return
    const sample: PeopleSample = { frame, receivedAt }
    this.latest.set(frame.robot_id, sample)
    this.listeners.get(frame.robot_id)?.forEach((l) => l(sample))
  }

  /** A perception/people payload as it came off the broker; dropped when malformed. */
  handlePayload(text: string, receivedAt = Date.now()): void {
    let raw: unknown
    try {
      raw = JSON.parse(text)
    } catch {
      return
    }
    const frame = parsePeopleFrame(raw)
    if (frame) this.push(frame, receivedAt)
  }

  clear(): void {
    this.latest.clear()
    this.listeners.clear()
  }
}

/** Whether a sample is recent enough to say the robot is sending people. */
export function peopleFresh(sample: PeopleSample | null | undefined, now = Date.now()): boolean {
  return !!sample && now - sample.receivedAt < PEOPLE_CLEAR_MS
}

/** Where the picture actually sits in its pane, in pane pixels: the media's
 * own size fitted as object-fit does it ('contain' letterboxes, 'cover'
 * crops), then zoomed about the centre (Steady's crop). */
export interface ContentRect { x: number; y: number; width: number; height: number }

export function contentRect(
  pane: { width: number; height: number },
  media: { width: number; height: number },
  fit: 'contain' | 'cover',
  zoom = 1,
): ContentRect {
  const { width: W, height: H } = pane
  const mw = media.width > 0 ? media.width : 16
  const mh = media.height > 0 ? media.height : 9
  const scale = (fit === 'cover' ? Math.max(W / mw, H / mh) : Math.min(W / mw, H / mh)) * zoom
  const width = mw * scale
  const height = mh * scale
  return { x: (W - width) / 2, y: (H - height) / 2, width, height }
}

/** A person as drawn: the box and the visible limbs in pane pixels. */
export interface DrawnPerson {
  key: string
  box: ContentRect
  confidence: number
  label: string
  limbs: [number, number, number, number][]
  joints: [number, number][]
}

/** The people of a frame in pane pixels, for `rect` (contentRect). Limbs only
 * between two keypoints both at least KEYPOINT_MIN_CONF sure. */
export function drawPeople(people: readonly Detection[], rect: ContentRect): DrawnPerson[] {
  const px = (x: number) => rect.x + x * rect.width
  const py = (y: number) => rect.y + y * rect.height
  return people.map((p, i) => {
    const [x, y, w, h] = p.bbox
    const kp = p.keypoints ?? null
    const sure = (k: number) => !!kp && !!kp[k] && kp[k][2] >= KEYPOINT_MIN_CONF
    const limbs: [number, number, number, number][] = []
    if (kp) {
      for (const [a, b] of COCO_SKELETON) {
        if (sure(a) && sure(b)) limbs.push([px(kp[a][0]), py(kp[a][1]), px(kp[b][0]), py(kp[b][1])])
      }
    }
    const joints: [number, number][] = kp
      ? kp.flatMap((k, j) => (sure(j) ? [[px(k[0]), py(k[1])] as [number, number]] : []))
      : []
    return {
      key: `${p.track_id ?? 'p'}-${i}`,
      box: { x: px(x), y: py(y), width: w * rect.width, height: h * rect.height },
      confidence: p.confidence,
      label: p.label,
      limbs,
      joints,
    }
  })
}
