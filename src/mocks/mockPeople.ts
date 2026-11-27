import { PeopleFeed, type PeopleSample } from '@/liveops/people'
import type { Detection, PeopleFrame } from '@/types'

/**
 * What the mock robots' perception sees (perception/people, schema 0.0.38):
 * two people strolling across the front camera, one of them now and then
 * waving, at 10 Hz -- only for a robot whose detection is on (`detecting`),
 * and only while someone is watching it, as a real robot sends nothing while
 * detection is off.
 */

const HZ = 10

/** A standing person's COCO-17 keypoints, relative to the box (0..1 of its
 * width and height): nose, eyes, ears, shoulders, elbows, wrists, hips, knees,
 * ankles. `wave` raises the right arm. */
function pose(wave: number): [number, number][] {
  const lift = Math.sin(wave) * 0.08
  return [
    [0.5, 0.08], [0.46, 0.06], [0.54, 0.06], [0.42, 0.08], [0.58, 0.08],
    [0.3, 0.22], [0.7, 0.22],
    [0.24, 0.38], wave ? [0.86, 0.12 + lift] : [0.76, 0.38],
    [0.22, 0.52], wave ? [0.84, -0.02 + lift] : [0.78, 0.52],
    [0.36, 0.55], [0.64, 0.55],
    [0.34, 0.76], [0.66, 0.76],
    [0.33, 0.97], [0.67, 0.97],
  ]
}

function person(trackId: string, cx: number, cy: number, h: number, wave: number, t: number): Detection {
  const w = h * 0.42
  const x = cx - w / 2
  const y = cy - h / 2
  return {
    label: 'person',
    confidence: Number((0.86 + 0.08 * Math.sin(t / 7 + cx * 5)).toFixed(2)),
    bbox: [x, y, w, h],
    camera: 'front',
    model: 'dfine_s',
    detector_id: 'base.person',
    track_id: trackId,
    // The left ankle drops out now and then, as a real pose model's does.
    keypoints: pose(wave).map(([kx, ky], i) => [x + kx * w, y + ky * h, i === 15 && Math.sin(t / 5) > 0.6 ? 0.1 : 0.9]),
  }
}

export class MockPeople {
  readonly feed = new PeopleFeed()
  private timers = new Map<string, ReturnType<typeof setInterval>>()

  private readonly site: (robotId: string) => string | undefined
  private readonly detecting: (robotId: string) => boolean

  constructor(site: (robotId: string) => string | undefined, detecting: (robotId: string) => boolean) {
    this.site = site
    this.detecting = detecting
  }

  /** The robot's people frames; walks them while anyone is subscribed. */
  subscribe(robotId: string, listener: (sample: PeopleSample) => void): () => void {
    const off = this.feed.subscribe(robotId, listener)
    if (!this.timers.has(robotId)) {
      let tick = 0
      this.timers.set(robotId, setInterval(() => {
        tick += 1
        if (this.detecting(robotId)) this.feed.push(this.frame(robotId, tick))
      }, 1000 / HZ))
    }
    return () => {
      off()
      if (!this.feed.watched(robotId)) {
        clearInterval(this.timers.get(robotId))
        this.timers.delete(robotId)
      }
    }
  }

  private frame(robotId: string, tick: number): PeopleFrame {
    const t = tick
    const a = 0.5 + 0.32 * Math.sin(t / 60)
    const b = 0.5 - 0.28 * Math.sin(t / 45 + 1)
    const people = [person('t1', a, 0.58, 0.62, 0, t)]
    // The second one comes and goes, and waves for a few seconds of each minute.
    if (Math.sin(t / 90) > -0.3) people.push(person('t2', b, 0.62, 0.48, (t % 600) < 50 ? t / 2 : 0, t))
    return { robot_id: robotId, site_id: this.site(robotId) ?? '', camera: 'front', at: new Date().toISOString(), people }
  }

  dispose(): void {
    for (const id of this.timers.values()) clearInterval(id)
    this.timers.clear()
    this.feed.clear()
  }
}
