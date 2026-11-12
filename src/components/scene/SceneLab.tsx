import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { color, font, radius, space } from '@/design-system/tokens'
import { useSiteMapFor } from '@/missions/useMissionMap'
import { useSceneData } from '@/scene3d/useSceneData'
import type { SceneGoal, SceneRobotPose, SceneRouteWaypoint, SceneView, SceneZone } from '@/scene3d/types'
import { useSessionStore } from '@/store/useSessionStore'
import { MapSceneLazy } from './MapSceneLazy'

/**
 * Dev-only harness for the map scene (`#/dev/scene`, only when
 * `import.meta.env.DEV`). Loads the active map of a site through the same
 * store the console uses, builds its scene, and lets every overlay be switched
 * on with fake values: a robot that can walk a circle, a goal, a route drawn
 * by tapping, zones, a fake lidar ring, and a pose being set. Not translated:
 * it is a developer's page, never shipped.
 */
export default function SceneLab() {
  const { t } = useTranslation()
  const sites = useSessionStore((s) => s.sites)
  const activeSiteId = useSessionStore((s) => s.activeSiteId)
  const [siteId, setSiteId] = useState(activeSiteId)
  const { map } = useSiteMapFor(siteId)
  const [floorIndex, setFloorIndex] = useState(0)
  useEffect(() => { if (map && !map.floors.some((f) => f.index === floorIndex)) setFloorIndex(map.floors[0]?.index ?? 0) }, [map, floorIndex])
  const scene = useSceneData(map, floorIndex)

  const [view, setView] = useState<SceneView>('plan')
  const [followTarget, setFollowTarget] = useState<'robot' | 'standin'>('standin')
  const [pointerMode, setPointerMode] = useState<'tap' | 'pose'>('tap')
  const [tapDoes, setTapDoes] = useState<'waypoint' | 'goal'>('waypoint')
  const [tilted, setTilted] = useState(false)
  const [route, setRoute] = useState<SceneRouteWaypoint[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [robotOn, setRobotOn] = useState(false)
  const [walking, setWalking] = useState(false)
  const [stale, setStale] = useState(false)
  const [estimated, setEstimated] = useState(true)
  const [goal, setGoal] = useState<SceneGoal | null>(null)
  const [refused, setRefused] = useState(false)
  const [goalLine, setGoalLine] = useState(true)
  const [zonesOn, setZonesOn] = useState(true)
  const [scanOn, setScanOn] = useState(false)
  const [poseDraft, setPoseDraft] = useState<{ x: number; y: number; yaw: number } | null>(null)
  const [poseStart, setPoseStart] = useState<{ x: number; y: number } | null>(null)
  const [frameN, setFrameN] = useState(0)
  const [phase, setPhase] = useState(0)

  const data = scene.data
  const centre = useMemo(() => {
    if (!data) return { x: 0, y: 0 }
    const { grid } = data
    const { minX, minY, maxX, maxY } = grid.content
    return { x: grid.origin[0] + (minX + maxX + 1) / 2 * grid.res, y: grid.origin[1] + (minY + maxY + 1) / 2 * grid.res }
  }, [data])

  useEffect(() => {
    if (!walking) return
    const id = window.setInterval(() => setPhase((p) => p + 0.05), 100)
    return () => window.clearInterval(id)
  }, [walking])

  const robot: SceneRobotPose | null = useMemo(() => robotOn
    ? { x: centre.x + Math.cos(phase) * 2, y: centre.y + Math.sin(phase) * 2, yaw: phase + Math.PI / 2, stale, estimated }
    : null, [robotOn, centre, phase, stale, estimated])

  const scan = useMemo(() => {
    if (!scanOn || !robot) return null
    const out = new Float32Array(360 * 2)
    for (let k = 0; k < 360; k++) {
      const a = k * Math.PI / 180
      const r = 3 + 0.4 * Math.sin(a * 5)
      out[k * 2] = robot.x + Math.cos(a) * r
      out[k * 2 + 1] = robot.y + Math.sin(a) * r
    }
    return out
  }, [scanOn, robot])

  const zones: SceneZone[] = useMemo(() => {
    if (!zonesOn) return []
    const c = centre
    const sq = (dx: number, dy: number, s: number): [number, number][] =>
      [[c.x + dx, c.y + dy], [c.x + dx + s, c.y + dy], [c.x + dx + s, c.y + dy + s], [c.x + dx, c.y + dy + s]]
    const own = (map?.zones ?? []).map((z) => ({ id: z.zone_id, kind: z.kind, points: z.polygon, label: z.label }))
    return [
      ...own,
      { id: 'fake-no-go', kind: 'no_go', points: sq(3, 3, 1.5), label: 'Fake no-go' },
      { id: 'fake-stairs', kind: 'stairs', points: sq(-4.5, 3, 1.5), label: 'Fake stairs' },
      { id: 'fake-fence', kind: 'geofence', points: sq(-6, -6, 12), label: 'Fake geofence' },
    ]
  }, [zonesOn, centre, map])

  const sceneRoute = useMemo(() => route.map((w, k) => ({ ...w, label: w.label || `Waypoint ${k + 1}` })), [route])
  const goalShown = useMemo(() => (goal ? { ...goal, refused } : null), [goal, refused])

  const addWaypoint = (x: number, y: number) => {
    const id = `wp-${Date.now().toString(36)}-${route.length}`
    setRoute((r) => [...r, { id, x, y, label: `Waypoint ${r.length + 1}`, note: r.length === 1 ? 'A note under the second one' : undefined }])
  }

  const label: React.CSSProperties = { display: 'inline-flex', gap: 4, alignItems: 'center', fontSize: font.size.sm, color: color.t2 }
  const btn: React.CSSProperties = {
    border: 'none', borderRadius: radius.sm, padding: '4px 10px', background: color.card, color: color.t1,
    fontFamily: font.family, fontSize: font.size.sm, cursor: 'pointer',
  }
  const check = (on: boolean, set: (v: boolean) => void, text: string) => (
    <label style={label}><input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} />{text}</label>
  )

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: color.bg, color: color.t1, fontFamily: font.family }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: `${space[2]}px ${space[4]}px`, alignItems: 'center', padding: space[3] }}>
        <strong style={{ fontSize: font.size.lg }}>Scene lab</strong>
        <label style={label}>Site
          <select value={siteId} onChange={(e) => setSiteId(e.target.value)}>
            {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <span style={label}>{map ? `${map.name ?? map.map_id} · ${map.status}` : 'no map'}</span>
        {map && map.floors.length > 1 && (
          <label style={label}>Floor
            <select value={floorIndex} onChange={(e) => setFloorIndex(Number(e.target.value))}>
              {map.floors.map((f) => <option key={f.index} value={f.index}>{f.label ?? `Floor ${f.index}`}</option>)}
            </select>
          </label>
        )}
        <label style={label}>Follow
          <select value={followTarget} onChange={(e) => setFollowTarget(e.target.value as 'robot' | 'standin')}>
            <option value="standin">stand-in (Missions)</option>
            <option value="robot">robot (LiveOps)</option>
          </select>
        </label>
        <label style={label}>Pointer
          <select value={pointerMode} onChange={(e) => { setPointerMode(e.target.value as 'tap' | 'pose'); setPoseDraft(null) }}>
            <option value="tap">tap</option>
            <option value="pose">pose</option>
          </select>
        </label>
        <label style={label}>Tap
          <select value={tapDoes} onChange={(e) => setTapDoes(e.target.value as 'waypoint' | 'goal')}>
            <option value="waypoint">adds a waypoint</option>
            <option value="goal">sets the goal</option>
          </select>
        </label>
        {check(robotOn, setRobotOn, 'Robot')}
        {check(walking, setWalking, 'walks')}
        {check(stale, setStale, 'stale')}
        {check(estimated, setEstimated, 'estimated')}
        {check(refused, setRefused, 'goal refused')}
        {check(goalLine, setGoalLine, 'goal line')}
        {check(zonesOn, setZonesOn, 'Zones')}
        {check(scanOn, setScanOn, 'Scan')}
        {check(tilted, setTilted, 'tilted')}
        <button type="button" style={btn} onClick={() => { setRoute([]); setSelected(null) }}>Clear route</button>
        <button type="button" style={btn} onClick={() => setRoute((r) => r.slice(0, -1))}>Undo</button>
        <button type="button" style={btn} onClick={() => setGoal(null)}>Clear goal</button>
        <button type="button" style={btn} onClick={() => setFrameN((n) => n + 1)}>Frame</button>
      </div>
      <div style={{ flex: 1, minHeight: 0, padding: `0 ${space[3]}px ${space[3]}px` }}>
        {data ? (
          <MapSceneLazy
            data={data}
            views={['plan', 'fly', 'follow']}
            view={view}
            onViewChange={setView}
            followTarget={followTarget}
            route={sceneRoute}
            selectedWaypointId={selected}
            robot={robot}
            goal={goalShown}
            goalLine={goalLine}
            poseDraft={poseDraft}
            zones={zones}
            scan={scan}
            pointerMode={pointerMode}
            onFloorTap={(x, y) => (tapDoes === 'goal' ? setGoal({ x, y }) : addWaypoint(x, y))}
            onWaypointClick={(id) => setSelected((s) => (s === id ? null : id))}
            onStandinWaypoint={addWaypoint}
            onFloorPoseDown={(x, y) => { setPoseStart({ x, y }); setPoseDraft({ x, y, yaw: 0 }) }}
            onFloorPoseMove={(x, y) => { if (poseStart) setPoseDraft({ ...poseStart, yaw: Math.atan2(y - poseStart.y, x - poseStart.x) }) }}
            onFloorPoseUp={(x, y) => {
              if (poseStart) setPoseDraft({ ...poseStart, yaw: Math.atan2(y - poseStart.y, x - poseStart.x) })
              setPoseStart(null)
            }}
            tilted={tilted}
            onTiltChange={setTilted}
            frameKey={`${data.mapId}/${data.floorIndex}/${frameN}`}
            style={{ width: '100%', height: '100%', borderRadius: radius.xl }}
          />
        ) : (
          <div style={{ padding: space[6], color: color.t2 }}>
            {scene.status === 'ready' ? '' : t(`scene.status.${scene.status}`)}
            {scene.reason ? ` (${scene.reason})` : ''}
          </div>
        )}
      </div>
    </div>
  )
}
