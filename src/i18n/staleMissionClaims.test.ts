import { describe, expect, it } from 'vitest'
import { RESOURCES } from './index'

/** Claims that stopped being true when program missions began running on the
 * robot's edge bridge (feature/edge-mission-runs): Run now and the editor's
 * test run execute them there. What is still off is routes, and scheduled runs
 * until E-Stop has been tested on a moving robot. The Missions library kept
 * telling operators nothing could run (hardware test 2026-10-30). */
const STALE: RegExp[] = [
  /nothing on the robot side can run a mission/i,
  /mission_executor\.py is empty/i,
  /until the mission executor exists/i,
  /nothing is sent to a robot yet/i,
  /runs? in the browser/i,
  /로봇 측에서 미션을 실행할 수 있는 것이 아직 없/,
  /mission_executor\.py가 비어/,
  /미션 실행기가 생기기 전/,
  /아직 로봇으로 보내지는 것은 없/,
  /브라우저에서 실행/,
]

function flat(o: object, p = ''): [string, string][] {
  return Object.entries(o).flatMap(([k, v]) =>
    typeof v === 'string' ? [[`${p}${k}`, v] as [string, string]] : flat(v as object, `${p}${k}.`))
}

describe('no locale says missions cannot run on the robot', () => {
  for (const [code, res] of Object.entries(RESOURCES)) {
    it(code, () => {
      const hits = flat(res.translation).filter(([, v]) => STALE.some((re) => re.test(v))).map(([k]) => k)
      expect(hits).toEqual([])
    })
  }
})
