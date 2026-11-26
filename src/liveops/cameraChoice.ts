import type { CameraFacing, CameraMode } from '@/components/liveops/feed/CameraModeTabs'
import { useRemembered, viewKey } from '@/lib/viewMemory'
import { useSessionStore } from '@/store/useSessionStore'

/**
 * The main camera -- which way it faces and which picture it shows -- as one
 * remembered choice per site and robot, shared by every LiveOps layout.
 *
 * Every view used to hold its own `useState('front')`, so switching layout or
 * reloading put the operator back on the front camera whatever they had been
 * watching (2026-11-26). The views now all read and write the same key, which
 * is what makes a layout switch keep the camera: the old view unmounts, the new
 * one mounts and reads what the old one wrote.
 *
 * Per robot, because which camera is worth watching depends on the robot and
 * the job it is on; per site, because a robot id is only meaningful within one.
 *
 * What a robot can show: every robot the console knows has a front and a rear
 * RGB camera -- there is no per-robot camera list on the wire -- and a camera
 * whose stream is missing is the feed pane's business (it says there is no
 * picture rather than drawing anything). Depth needs DDS, so a remembered
 * Depth is *shown* as RGB while DDS is down (`shownCameraMode`) and comes back
 * on its own when the link does; nothing is rewritten. Thermal is in the
 * `CameraMode` union but no robot has one and the bar does not offer it, so a
 * remembered Thermal is not a valid choice and reads as the default.
 */
export interface CameraChoice {
  facing: CameraFacing
  mode: CameraMode
}

export const DEFAULT_CAMERA_CHOICE: CameraChoice = { facing: 'front', mode: 'rgb' }

const FACINGS: readonly CameraFacing[] = ['front', 'back']
/** The modes the camera bar offers (CameraModeTabs' TABS), not the whole union. */
const OFFERED_MODES: readonly CameraMode[] = ['rgb', 'depth']

export function isCameraChoice(v: unknown): v is CameraChoice {
  if (typeof v !== 'object' || v === null) return false
  const { facing, mode } = v as Record<string, unknown>
  return FACINGS.includes(facing as CameraFacing) && OFFERED_MODES.includes(mode as CameraMode)
}

/** `rh.view.camera.{site}.{robot}`, or null until both are known -- a view
 * with no site yet keeps its choice in memory rather than under "undefined". */
export function cameraChoiceKey(siteId: string | null | undefined, robotId: string | null | undefined): string | null {
  return siteId && robotId ? viewKey('camera', siteId, robotId) : null
}

/** The mode the bar shows as pressed: Depth only while DDS can carry it. */
export function shownCameraMode(mode: CameraMode, ddsAvailable: boolean): CameraMode {
  return mode === 'depth' && !ddsAvailable ? 'rgb' : mode
}

export interface CameraChoiceState extends CameraChoice {
  setFacing: (facing: CameraFacing) => void
  setMode: (mode: CameraMode) => void
}

/** The remembered main camera for one robot on one site. */
export function useCameraChoice(siteId: string | null | undefined, robotId: string | null | undefined): CameraChoiceState {
  const [choice, setChoice] = useRemembered(cameraChoiceKey(siteId, robotId), DEFAULT_CAMERA_CHOICE, isCameraChoice)
  return {
    ...choice,
    // Each setter keeps the other half, so turning to the rear camera does not
    // drop the operator out of Depth, nor the reverse.
    setFacing: (facing) => setChoice({ ...choice, facing }),
    setMode: (mode) => setChoice({ ...choice, mode }),
  }
}

/** `useCameraChoice` for the robot a LiveOps view is showing, on the site the
 * console is on. */
export function useMainCamera(robotId: string): CameraChoiceState {
  const siteId = useSessionStore((s) => s.activeSiteId)
  return useCameraChoice(siteId, robotId)
}
