import i18n from '@/i18n'
import type { MissionLibraryEntry, MissionWaypoint, WaypointAction } from '@/types'

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
          label: i18n.t(dir === 'backward' ? 'missions.program.moveBackward' : 'missions.program.moveForward', { dist }),
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
        addAction({ type: 'wait', label: i18n.t('missions.program.waitSeconds', { seconds: block.fields.SECONDS }), params: { seconds: Number(block.fields.SECONDS) } })
        break
      case 'rh_snapshot':
        addAction({ type: 'snapshot', label: i18n.t('missions.actions.snapshot'), params: {} })
        break
      case 'rh_speak':
        addAction({ type: 'voice_prompt', label: i18n.t('missions.program.speak', { text: block.fields.TEXT }), params: { text: String(block.fields.TEXT) } })
        break
      case 'rh_led':
        addAction({ type: 'led_signal', label: i18n.t('missions.actions.led_signal'), params: {} })
        break
      // rh_start / rh_set_speed: no waypoint effect
    }
  }

  return waypoints
}

/**
 * Keeps task settings made in the Route tab across a recompile. For waypoint i
 * and task j, when the previous waypoint i had a task j of the same type, its
 * params are kept under the compiled ones: a clip, volume or camera survives,
 * while what the blocks say (seconds, text) wins. Pure; inputs are not mutated.
 */
export function mergeTaskParams(previous: MissionWaypoint[], compiled: MissionWaypoint[]): MissionWaypoint[] {
  return compiled.map((wp, i) => ({
    ...wp,
    actions: wp.actions.map((a, j) => {
      const prev = previous[i]?.actions[j]
      return prev && prev.type === a.type ? { ...a, params: { ...prev.params, ...a.params } } : a
    }),
  }))
}

/**
 * The mission after the Program compiles. Returns the same object when the
 * merged route and the program state are unchanged, so opening the Program
 * tab doesn't mark an untouched mission unsaved. A changed route clears
 * segments, which were keyed to the old waypoints.
 */
export function applyCompiledProgram(mission: MissionLibraryEntry, compiled: MissionWaypoint[], state: string): MissionLibraryEntry {
  const waypoints = mergeTaskParams(mission.waypoints, compiled)
  const sameRoute = JSON.stringify(waypoints) === JSON.stringify(mission.waypoints)
  if (sameRoute && state === mission.program_state) return mission
  if (sameRoute) return { ...mission, program_state: state }
  return { ...mission, waypoints, program_state: state, segments: [] }
}

/**
 * Whether a Program-tab change should recompile the mission's route.
 *
 * Opening the tab compiles only a mission that already has a program: a
 * route drawn on the map has none, and compiling Blockly's empty starting
 * canvas would replace it the moment the tab was opened. Interface events
 * (selecting, scrolling, zooming) never compile. A real block edit always
 * does, which is the point at which the program takes over the route.
 */
export function shouldCompileProgram({ onOpen, isUiEvent, hasProgram }: {
  onOpen: boolean
  isUiEvent: boolean
  hasProgram: boolean
}): boolean {
  if (onOpen) return hasProgram
  return !isUiEvent
}
