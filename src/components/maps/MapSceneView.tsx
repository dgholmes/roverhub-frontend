import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { radius } from '@/design-system/tokens'
import { MapSceneLazy } from '@/components/scene/MapSceneLazy'
import { sceneZones } from '@/components/missions/route-editor/RouteScene'
import type { SceneData, SceneView } from '@/scene3d/types'
import type { MapZone } from '@/types/maps'

const VIEWS: SceneView[] = ['plan', 'fly']

/**
 * The Map page's 3D view: the same map scene LiveOps, the route editor and
 * the map editor draw (Plan with tilt, and Fly through it with the keys), with
 * its own Show / Colour / Points controls, over this floor's cloud and with
 * the map's zones on the floor. Read-only: a tap moves nothing, and nothing
 * here commands a robot (operator, 2026-11-26: "the other views of the map
 * with fly through should be seen there too").
 *
 * The page's Flat / 3D / Point cloud switch (`viewSwitch`) joins the scene's
 * top-right row, after Tilt, Reset view and Full screen, so the map's view
 * controls are one row (operator, 2026-11-26). With a "3D" beside it, the
 * scene's own Plan tilt button is called Tilt here; T still toggles it.
 */
export function MapSceneView({ data, zones, frameKey, viewSwitch }: {
  data: SceneData
  zones: readonly MapZone[]
  /** Re-frames the camera on the floor's content when it changes (map / floor). */
  frameKey: string
  /** The page's view switch, laid in the scene's top-right corner. */
  viewSwitch?: React.ReactNode
}) {
  const { t } = useTranslation()
  const [view, setView] = useState<SceneView>('plan')
  const [tilted, setTilted] = useState(true)
  const sceneZoneList = useMemo(() => sceneZones(zones), [zones])
  return (
    <MapSceneLazy
      data={data} views={VIEWS} view={view} onViewChange={setView} followTarget="standin"
      pointerMode="tap" tilted={tilted} onTiltChange={setTilted}
      zones={sceneZoneList} frameKey={frameKey}
      viewSwitch={viewSwitch} tiltLabel={t('scene.tiltNamed')}
      keyHelpOpen={false} allowFullscreen
      style={{ width: '100%', height: '100%', borderRadius: radius.md }}
    />
  )
}
