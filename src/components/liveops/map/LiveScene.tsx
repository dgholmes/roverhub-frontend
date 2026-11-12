import { useCallback, useEffect, useMemo, useRef } from 'react'
import { MapSceneLazy } from '@/components/scene/MapSceneLazy'
import { MIN_HEADING_DRAG_M } from '@/liveops/navGoal'
import type { ScanSample, ScanVisibility } from '@/liveops/scanFrame'
import type { SceneData, SceneGoal, SceneRobotPose, SceneRouteWaypoint, SceneView, SceneZone } from '@/scene3d/types'
import type { Mission, RobotState } from '@/types'
import type { MapZone } from '@/types/maps'
import type { NavGoalMarkers, NavMapInput } from './NavGoalLayer'
import type { MapView, SceneMapView } from './MapViewSwitch'
import { useLatestScan, useScanVisibility } from './useLiveScan'

/**
 * The LiveOps map as the 3D scene: 3D (the plan tilted), Fly and Follow (a
 * chase camera on the live robot). It shows what the flat map shows -- the
 * robot, the goal and its dashed line, the Set-position draft, the zones, the
 * mission route, the live lidar -- and turns the scene's floor taps into the
 * very same nav actions NavMapInput makes on Leaflet, so Go and Set position
 * reach the same checks and the same commands from every view.
 *
 * The floor point the scene reports is the map point under the cursor (map
 * metres, the scene maps X = x, Z = -y with no offset), passed on unchanged.
 */

type Markers = React.ComponentProps<typeof NavGoalMarkers>
type Input = React.ComponentProps<typeof NavMapInput>

const SCENE_VIEWS: SceneView[] = ['plan', 'fly', 'follow']

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)

/**
 * The live robot for the scene, or null when it has no map position. `stale`
 * and `estimated` mean what they mean on RobotMarker: stale when telemetry is
 * not live; estimated always, as the selected robot's marker always carries
 * its estimated badge (positions are estimates, docs/05-ui-ux.md §7.1).
 * `heading_deg` is body yaw anticlockwise from +x, which is what the scene's
 * `yaw` is, in radians.
 */
export function scenePoseOf(robot: Pick<RobotState, 'position'>): SceneRobotPose | null {
  const p = robot.position
  if (!p || !finite(p.x_m) || !finite(p.y_m) || !finite(p.heading_deg)) return null
  return { x: p.x_m, y: p.y_m, yaw: (p.heading_deg * Math.PI) / 180, stale: p.freshness !== 'live', estimated: true }
}

/**
 * The one goal pin the scene draws, and whether its dashed line shows, read
 * off the same markers NavGoalMarkers draws. The goal the robot is walking to
 * wins over a pending pin (on the flat map both can show, but Go is disabled
 * while a walk runs, so they do not meet). A refused pin is red with no line;
 * the line needs the robot on the map (`from`).
 */
export function sceneGoalOf(m: Pick<Markers, 'from' | 'pending' | 'pendingRefused' | 'walking'>): { goal: SceneGoal | null; line: boolean } {
  if (m.walking) return { goal: { x: m.walking.x_m, y: m.walking.y_m }, line: !!m.from }
  if (m.pending) {
    return {
      goal: { x: m.pending[0], y: m.pending[1], refused: m.pendingRefused },
      line: !!m.from && !m.pendingRefused,
    }
  }
  return { goal: null, line: false }
}

/**
 * The Set-position draft: shown once the drag gives it a heading, as the flat
 * map draws its arrow. Before that there is no heading to show, and the
 * scene's draft always carries an arrow, which would claim one.
 */
export function scenePoseDraftOf(pose: Markers['pose']): { x: number; y: number; yaw: number } | null {
  if (!pose) return null
  const dx = pose.toward[0] - pose.at[0]
  const dy = pose.toward[1] - pose.at[1]
  if (Math.hypot(dx, dy) < MIN_HEADING_DRAG_M) return null
  return { x: pose.at[0], y: pose.at[1], yaw: Math.atan2(dy, dx) }
}

/**
 * The zones the flat map's layers would draw: geofences with the Geofences
 * layer on, no-go zones with No-Go Zones on. A flight of stairs goes with the
 * no-go zones: walking treats it as one, and refuses a goal on it.
 */
export function sceneZonesOf(
  zones: readonly MapZone[] | undefined, show: { geofence: boolean; noGo: boolean },
): SceneZone[] {
  return (zones ?? [])
    .filter((z) => (z.kind === 'geofence' ? show.geofence : show.noGo))
    .map((z) => ({ id: z.zone_id, kind: z.kind, points: z.polygon.map(([x, y]) => [x, y] as [number, number]), label: z.label }))
}

/** The mission's waypoints, as RouteLayer draws them. */
export function sceneRouteOf(mission: Pick<Mission, 'waypoints'> | undefined): SceneRouteWaypoint[] {
  return (mission?.waypoints ?? []).map((wp) => ({ id: wp.waypoint_id, x: wp.x_m, y: wp.y_m, label: wp.label }))
}

/** A lidar frame as the scene's x,y pairs; null when there is nothing to draw
 * (none, another map's, or too old: ScanLayer's rule). */
export function scanPointsOf(sample: ScanSample | null, visibility: ScanVisibility): Float32Array | null {
  if (!sample || visibility === 'hidden') return null
  const out = new Float32Array(sample.frame.points.length * 2)
  sample.frame.points.forEach(([x, y], i) => { out[i * 2] = x; out[i * 2 + 1] = y })
  return out
}

/** The live lidar for the scene, while the layer is on. */
function useScenePoints(robotId: string, mapId: string, on: boolean): Float32Array | null {
  const sample = useLatestScan(robotId)
  const visibility = useScanVisibility(sample, mapId)
  const hidden = !on || visibility === 'hidden'
  return useMemo(() => (hidden ? null : scanPointsOf(sample, 'live')), [sample, hidden])
}

export interface LiveSceneProps {
  data: SceneData
  view: SceneMapView
  /** The scene asks for the flat map back (T, the 3D button, Reset view in 3D). */
  onViewChange: (view: MapView) => void
  robot: RobotState
  mission?: Mission
  mapId: string
  zones?: readonly MapZone[]
  layers: { geofence: boolean; noGoZones: boolean; lidar: boolean }
  markers: Markers
  input: Input
}

/**
 * MapScene for LiveOps. Every overlay is memoized on what it is drawn from, so
 * a telemetry frame that changes nothing but the robot's pose rebuilds
 * nothing but the pose (MapScene rebuilds an overlay on each new identity).
 */
export function LiveScene({ data, view, onViewChange, robot, mission, mapId, zones, layers, markers, input }: LiveSceneProps) {
  const { x_m, y_m, heading_deg, freshness } = robot.position ?? {}
  const pose = useMemo(
    () => scenePoseOf({ position: { x_m, y_m, heading_deg, freshness } as RobotState['position'] }),
    [x_m, y_m, heading_deg, freshness],
  )

  // The goal on primitives: `walking` and `from` are new objects each frame.
  const { from, pending, pendingRefused, walking } = markers
  const hasFrom = !!from
  const wx = walking?.x_m, wy = walking?.y_m
  const px = pending?.[0], py = pending?.[1]
  const { goal, line } = useMemo(
    () => sceneGoalOf({
      from: hasFrom ? { x_m: 0, y_m: 0 } : null,
      pending: px !== undefined && py !== undefined ? [px, py] : null,
      pendingRefused,
      walking: wx !== undefined && wy !== undefined ? { x_m: wx, y_m: wy } : null,
    }),
    [hasFrom, px, py, pendingRefused, wx, wy],
  )
  const poseDraft = useMemo(() => scenePoseDraftOf(markers.pose), [markers.pose])

  const sceneZones = useMemo(
    () => sceneZonesOf(zones, { geofence: layers.geofence, noGo: layers.noGoZones }),
    [zones, layers.geofence, layers.noGoZones],
  )

  // Keyed on what is drawn, not on the mission's identity, which a store may
  // renew per frame.
  const routeKey = (mission?.waypoints ?? []).map((wp) => `${wp.waypoint_id}:${wp.x_m}:${wp.y_m}:${wp.label}`).join('|')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const route = useMemo(() => sceneRouteOf(mission), [routeKey])

  const scan = useScenePoints(robot.robot_id, mapId, layers.lidar)

  // Pointer: exactly NavMapInput's modes. Go: a tap (a click without a drag)
  // on the floor is a tap. Set position: camera drag is off and press, drag
  // and release on the floor are the pose. Idle: the floor does nothing.
  const { mode, onTap, onPress, onDrag, onRelease, onEscape } = input
  const tap = useCallback((x: number, y: number) => onTap([x, y]), [onTap])
  const press = useCallback((x: number, y: number) => onPress([x, y]), [onPress])
  const drag = useCallback((x: number, y: number) => onDrag([x, y]), [onDrag])
  const release = useCallback((x: number, y: number) => onRelease([x, y]), [onRelease])

  // Esc leaves either mode, as on the flat map.
  const escape = useRef(onEscape)
  useEffect(() => { escape.current = onEscape })
  useEffect(() => {
    if (mode === 'idle') return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') escape.current() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode])

  // Flat Plan is the Leaflet map, so the scene's Plan is always tilted: a
  // request to flatten it is a request for the flat map.
  const onTiltChange = useCallback((tilted: boolean) => { if (!tilted) onViewChange('plan') }, [onViewChange])
  const onSceneView = useCallback((v: SceneView) => onViewChange(v === 'plan' ? '3d' : v), [onViewChange])

  return (
    <MapSceneLazy
      data={data}
      views={SCENE_VIEWS}
      view={view === '3d' ? 'plan' : view}
      onViewChange={onSceneView}
      showViewSwitch={false}
      tilted
      onTiltChange={onTiltChange}
      followTarget="robot"
      robot={pose}
      goal={goal}
      goalLine={line}
      poseDraft={poseDraft}
      zones={sceneZones}
      route={route}
      scan={scan}
      pointerMode={mode === 'setPosition' ? 'pose' : 'tap'}
      onFloorTap={mode === 'go' ? tap : undefined}
      onFloorPoseDown={mode === 'setPosition' ? press : undefined}
      onFloorPoseMove={mode === 'setPosition' ? drag : undefined}
      onFloorPoseUp={mode === 'setPosition' ? release : undefined}
      style={{ width: '100%', height: '100%', cursor: mode === 'idle' ? undefined : 'crosshair' }}
    />
  )
}
