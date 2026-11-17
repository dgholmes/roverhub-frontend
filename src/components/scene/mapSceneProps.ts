import type {
  SceneData, SceneGoal, SceneRobotPose, SceneRouteWaypoint, SceneView, SceneZone,
} from '@/scene3d/types'
import type { FloorRect, SceneEditBox } from '@/scene3d/boxSelect'

/**
 * MapScene's props: the contract the Missions and LiveOps hosts use. In its
 * own module so a host can import the type without pulling three.js into its
 * chunk (MapScene itself is reached only through MapSceneLazy).
 */
export interface MapSceneProps {
  data: SceneData
  /** Which view buttons to show, in order. */
  views: SceneView[]
  view: SceneView
  onViewChange: (v: SceneView) => void
  /** 'robot' chases `robot` (LiveOps); 'standin' is the prototype's drivable stand-in (Missions). */
  followTarget: 'robot' | 'standin'
  // overlays
  route?: SceneRouteWaypoint[]
  selectedWaypointId?: string | null
  robot?: SceneRobotPose | null
  goal?: SceneGoal | null
  /** Dashed line from the robot to the goal. */
  goalLine?: boolean
  /** The route Nav2 is planning (x,y pairs in map metres), drawn solid from
   * the robot; `failed` draws it amber. Null or absent draws none. */
  navPath?: { points: Float32Array; failed: boolean } | null
  poseDraft?: { x: number; y: number; yaw: number } | null
  zones?: SceneZone[]
  /** Live lidar points, x,y pairs in map metres. */
  scan?: Float32Array | null
  // interaction
  /** 'tap': a click without a drag on the floor calls onFloorTap; drags move the camera.
   *  'pose': camera drag is off; press/drag/release on the floor call onFloorPose*. */
  pointerMode: 'tap' | 'pose'
  onFloorTap?: (x: number, y: number) => void
  onFloorPoseDown?: (x: number, y: number) => void
  onFloorPoseMove?: (x: number, y: number) => void
  onFloorPoseUp?: (x: number, y: number) => void
  onWaypointClick?: (id: string) => void
  /** Missions follow: Space drops a waypoint where the stand-in stands. */
  onStandinWaypoint?: (x: number, y: number) => void
  /** Host controls laid over the top-right (e.g. LiveOps' Go / Set position buttons). */
  overlay?: React.ReactNode
  /** Plan view: tilt state, controlled when given (LiveOps' "3D" button sets it true). T still toggles and calls onTiltChange. */
  tilted?: boolean
  onTiltChange?: (tilted: boolean) => void
  /** Hide the scene's own view buttons when the host draws its own switch (LiveOps). Default true. */
  showViewSwitch?: boolean
  /** When this changes, re-frame the camera: to the route if it has waypoints, else to the floor's content. */
  frameKey?: string
  /** Pixels the host's own panels cover at each edge (LiveOps' telemetry card,
   * camera dock, Go / Set position tools, Walk / Stop bar): the scene's
   * controls are laid inside them. Default none. */
  insets?: { top?: number; left?: number; right?: number; bottom?: number }
  /** Default true. LiveOps passes false: a fullscreen map would cover the
   * E-Stop and the command bar, which live outside it. */
  allowFullscreen?: boolean
  /** Whether the key list starts open. Default true; LiveOps starts it folded, since it covers the live map. */
  keyHelpOpen?: boolean
  /** Default true. False puts the scene's own controls away (toolbar, view
   * buttons, minimap, keys, touch pad); taps, drags and keys still work. */
  showControls?: boolean
  // The map editor's box select (Missions › Maps › Edit map). Opt-in: with
  // none of these given the scene behaves exactly as before.
  /** A left drag on the floor draws a rectangle (Plan and Fly) instead of
   *  moving the camera; Shift-drag and right-drag still move it. */
  boxSelect?: boolean
  /** The rectangle being dragged (map metres), null when the drag ends. */
  onBoxDraft?: (rect: FloorRect | null) => void
  /** The rectangle when the drag is released. */
  onBoxSelect?: (rect: FloorRect) => void
  /** Boxes to draw (heights above the floor). */
  editBoxes?: SceneEditBox[]
  /** x, y, height triples drawn as amber dots over the cloud. */
  highlightPoints?: Float32Array | null
  className?: string
  style?: React.CSSProperties
}
