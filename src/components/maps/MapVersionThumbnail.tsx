import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Map as MapIcon } from 'lucide-react'
import { color, font, radius, space } from '@/design-system/tokens'
import { dataProvider } from '@/lib/realtime/dataProvider'
import { contentBoundsM } from '@/liveops/contentBounds'
import type { MapVersion } from '@/types/mapPipeline'
import type { MapArtifactKind } from '@/types/maps'
import {
  floorBox, fromBounds, usePaintedThumbnail, useThumbnailGrid, viewBoxOf, type GridRequest, type MetreBox,
} from '@/components/org/floorThumbnail'

/** What the thumbnail drew, for tests and for anyone reading the DOM. */
export type VersionThumbnailKind =
  /** The floor's grid, painted in the scene palette and cropped to the content. */
  | 'painted'
  /** The backend's preview image: the grid could not be painted. */
  | 'image'
  /** Not drawn yet: off screen, or its grid is on its way. */
  | 'loading'
  /** Nothing to draw: no floor, or no stored files (mock mode). */
  | 'none'

/** Where one of a version's floor files is. Kept versions are archived under
 *  `versions/{v}`; the current one IS the live map, whose files are the map's
 *  own (the backend archives a bundle only once it is replaced). '' when the
 *  provider has no files (mock mode) or the version does not say its map. */
export function versionFloorUrl(v: MapVersion, floorIndex: number, kind: MapArtifactKind): string {
  if (!v.map_id) return ''
  return v.current
    ? dataProvider.mapArtifactUrl(v.map_id, floorIndex, kind)
    : dataProvider.mapVersionArtifactUrl(v.map_id, v.version, floorIndex, kind)
}

/** The version's first floor's grid and its cache key. The current version is
 *  keyed as the live map is (`gridRequests`), so a grid LiveOps or Missions
 *  already decoded is not fetched again; a kept version never changes, so its
 *  number is key enough. */
export function versionGridRequest(v: MapVersion): GridRequest | null {
  const floor = v.floors[0]
  if (!floor) return null
  const url = versionFloorUrl(v, floor.index, 'grid')
  if (!url) return null
  const key = v.current ? `${v.map_id}@${v.updated_at}/${floor.index}` : `${v.map_id}@v${v.version}/${floor.index}`
  return { url, key }
}

/**
 * A map version's first floor, small: its grid painted as Org › Sites'
 * thumbnail paints a live map (scene palette, cropped to the surveyed content,
 * following the theme), falling back to the version's preview image. Nothing
 * is fetched until `load` -- the version list holds a row back until it is on
 * screen, since a grid is a few MB -- and each grid is decoded once a session.
 */
export function MapVersionThumbnail({ version, load, height, width = '100%' }: {
  version: MapVersion
  /** Fetch and draw. False draws an empty frame. */
  load: boolean
  height: number | string
  width?: number | string
}) {
  const { t } = useTranslation()
  const floor = version.floors[0] ?? null
  const req = versionGridRequest(version)
  const { grid, failed: gridFailed } = useThumbnailGrid(req, floor, load)
  const { floor: painted, failed: paintFailed } = usePaintedThumbnail(grid)
  const previewUrl = floor ? versionFloorUrl(version, floor.index, 'preview') : ''
  const [failedUrl, setFailedUrl] = useState<string | null>(null)

  const frame: React.CSSProperties = {
    position: 'relative', width, height, borderRadius: radius.sm, background: color.mapBg,
    overflow: 'hidden', flexShrink: 0, minWidth: 0,
  }
  const waiting = !load || (!grid && !gridFailed) || (!!grid && !painted && !paintFailed)
  const showImage = !painted && !waiting && !!previewUrl && failedUrl !== previewUrl

  if (!floor || (!painted && !waiting && !showImage)) {
    return (
      <div data-thumbnail="none" style={{
        ...frame, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: space[1],
        color: color.t3, fontSize: font.size.xs, textAlign: 'center',
      }}>
        <MapIcon size={16} strokeWidth={1.75} aria-hidden />
        <span>{t('missions.maps.versions.thumbNone')}</span>
      </div>
    )
  }

  const { x0, y0, w, h } = floorBox(floor)
  const whole: MetreBox = { xLo: x0, yLo: y0, xHi: x0 + w, yHi: y0 + h }
  const paintedBox = painted ? fromBounds(painted.bounds) : null
  const view: MetreBox = paintedBox ?? (grid ? fromBounds(contentBoundsM(grid)) : whole)
  const kind: VersionThumbnailKind = painted ? 'painted' : showImage ? 'image' : 'loading'

  return (
    <div data-thumbnail={kind} style={{ ...frame, background: painted ? color.sceneBg : color.mapBg }}>
      {!waiting && (
        <svg
          role="img" aria-label={t('missions.maps.versions.thumb', { version: version.version })}
          viewBox={viewBoxOf(view)} preserveAspectRatio="xMidYMid meet"
          style={{ width: '100%', height: '100%', display: 'block' }}
        >
          {painted && paintedBox && (
            <image
              href={painted.url} x={paintedBox.xLo} y={-paintedBox.yHi}
              width={paintedBox.xHi - paintedBox.xLo} height={paintedBox.yHi - paintedBox.yLo} preserveAspectRatio="none"
            />
          )}
          {showImage && (
            <image
              href={previewUrl} x={x0} y={-(y0 + h)} width={w} height={h} preserveAspectRatio="none"
              onError={() => setFailedUrl(previewUrl)}
            />
          )}
        </svg>
      )}
    </div>
  )
}
