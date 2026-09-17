import type { MissionWaypoint, WaypointAction } from '@/types'

export interface CompiledBlock {
  type: string
  fields: Record<string, string | number>
}

/**
 * Walks a flat, already-ordered block list and dead-reckons a waypoint route
 * from it — same heading/position integration math as LiveOps' manual-drive
 * burst handling (mockDataProvider.driveRobot), starting from the ground-plane
 * origin. `rh_move` advances position and creates a waypoint; `rh_rotate`
 * changes heading in place (no waypoint of its own — rotating doesn't visit a
 * new point); `rh_wait`/`rh_snapshot`/`rh_speak`/`rh_led` attach an action to
 * whichever waypoint was most recently created. `rh_set_speed` is
 * informational only — MissionWaypoint has no per-waypoint speed field.
 */
export function compileBlocksToWaypoints(blocks: CompiledBlock[]): MissionWaypoint[] {
  let x = 0
  let y = 0
  let heading = 0
  const waypoints: MissionWaypoint[] = []
  let count = 0

  function addAction(action: WaypointAction) {
    const wp = waypoints[waypoints.length - 1]
    if (wp) wp.actions.push(action)
  }

  for (const block of blocks) {
    switch (block.type) {
      case 'rh_move': {
        const dir = block.fields.DIRECTION
        const dist = Number(block.fields.DISTANCE)
        const signedDist = dir === 'backward' ? -dist : dist
        const rad = (heading * Math.PI) / 180
        x += Math.cos(rad) * signedDist
        y += Math.sin(rad) * signedDist
        count += 1
        waypoints.push({
          waypoint_id: `wp-prog-${count}`,
          label: `Move ${dir === 'backward' ? 'Backward' : 'Forward'} ${dist}m`,
          x_m: Math.round(x * 100) / 100,
          y_m: Math.round(y * 100) / 100,
          z_m: null,
          heading_deg: null,
          tolerance_m: 0.5,
          actions: [],
          status: 'pending',
        })
        break
      }
      case 'rh_rotate': {
        const dir = block.fields.DIRECTION
        const angle = Number(block.fields.ANGLE)
        heading += dir === 'left' ? angle : -angle
        heading = ((heading % 360) + 360) % 360
        break
      }
      case 'rh_wait':
        addAction({ type: 'wait', label: `Wait ${block.fields.SECONDS}s`, params: {} })
        break
      case 'rh_snapshot':
        addAction({ type: 'snapshot', label: 'Snapshot', params: {} })
        break
      case 'rh_speak':
        addAction({ type: 'voice_prompt', label: `Speak: "${block.fields.TEXT}"`, params: {} })
        break
      case 'rh_led':
        addAction({ type: 'led_signal', label: 'LED Signal', params: {} })
        break
      // rh_start / rh_set_speed: no waypoint effect
    }
  }

  return waypoints
}
