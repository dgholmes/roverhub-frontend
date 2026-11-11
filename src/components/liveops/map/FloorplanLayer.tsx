import { memo } from 'react'
import { ImageOverlay } from 'react-leaflet'
import { useTranslation } from 'react-i18next'
import { color, font, glass, radius, space } from '@/design-system/tokens'
import { dataProvider } from '@/lib/realtime/dataProvider'
import { boundsForFloor, sparseSurveyPercent } from '@/liveops/mapFloor'
import type { SiteMap } from '@/types/maps'

/**
 * The surveyed floorplan under the live layers. The preview image covers
 * exactly the floor's grid (`boundsForFloor`), and sits below the GridLayer's
 * lines and everything above them: Leaflet stacks an image overlay with a
 * positive z-index over the vector pane's SVG, so it takes a negative one.
 *
 * A thinly surveyed floor says so. Unknown cells are ground the lidar never
 * saw, not empty ground, and a plan drawn confidently over them invites a route
 * across it. The caption describes the data, so it stays when the image is
 * missing too.
 *
 * Memoized for the same reason GridLayer is: MapCanvas re-renders on every
 * telemetry frame, and `map` and `floorIndex` do not change with it.
 */
export const FloorplanLayer = memo(function FloorplanLayer({ map, floorIndex }: { map: SiteMap; floorIndex: number }) {
  const { t } = useTranslation()
  const floor = map.floors.find((f) => f.index === floorIndex)
  if (!floor) return null

  // mockDataProvider has no stored files and returns '' -- an <img src=""> would
  // re-request the page, so an empty URL means no image.
  const url = dataProvider.mapArtifactUrl(map.map_id, floor.index, 'preview')
  const surveyedPercent = sparseSurveyPercent(floor)

  return (
    <>
      {url && <ImageOverlay url={url} bounds={boundsForFloor(floor)} opacity={0.85} zIndex={-1} interactive={false} />}
      {surveyedPercent !== null && (
        <div
          role="status"
          style={{
            ...glass.overlay, border: 'none', background: color.amberBg,
            position: 'absolute', left: 12, bottom: 12, zIndex: 1000, pointerEvents: 'none',
            display: 'flex', alignItems: 'flex-start', gap: space[2],
            padding: `${space[2]}px ${space[3]}px`, borderRadius: radius.md,
            fontFamily: font.family, maxWidth: 240,
          }}
        >
          <span style={{ width: 8, height: 8, borderRadius: radius.full, background: color.amber, flexShrink: 0, marginTop: 4 }} />
          <span>
            <span style={{ display: 'block', fontSize: font.size.md, fontWeight: 600, color: color.t1 }}>
              {t('liveops.map.surveyedPercent', { percent: surveyedPercent })}
            </span>
            <span style={{ display: 'block', fontSize: font.size.sm, color: color.t2 }}>
              {t('liveops.map.surveyedWarning')}
            </span>
          </span>
        </div>
      )}
    </>
  )
})
