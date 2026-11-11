import { useEffect, useReducer, useRef, useState } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import { dataProvider } from '@/lib/realtime/dataProvider'
import { useThemeStore } from '@/lib/theme'
import { rgbCss, themeRgb, type Rgb } from '@/liveops/cssColor'
import { SCAN_FADE_MS, SCAN_HIDE_MS, scanVisibility, type ScanSample, type ScanVisibility } from '@/liveops/scanFrame'

/** Its own pane: above the overlay pane's zones, route and robot body (400),
 * below the markers (600), and never in the way of a tap. */
const SCAN_PANE = 'rh-scan'
const DOT_RADIUS_PX = 2
const FADED_OPACITY = 0.35
const FALLBACK_SCAN: Rgb = [191, 90, 242]

/** The robot's latest lidar frame from the provider, or null. A new robot
 * starts with none. */
export function useLatestScan(robotId: string): ScanSample | null {
  const [latest, setLatest] = useState<{ robotId: string; sample: ScanSample } | null>(null)
  useEffect(
    () => dataProvider.subscribeScan(robotId, (sample) => setLatest({ robotId, sample })),
    [robotId],
  )
  return latest && latest.robotId === robotId ? latest.sample : null
}

/** How the sample is drawn now; re-evaluated when it crosses the fade and hide
 * ages, so a robot that stops sending fades and then disappears on its own. */
export function useScanVisibility(sample: ScanSample | null, mapId: string): ScanVisibility {
  const [, tick] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    if (!sample) return
    const age = Date.now() - sample.receivedAt
    const timers = [SCAN_FADE_MS, SCAN_HIDE_MS]
      .filter((at) => at > age)
      .map((at) => setTimeout(tick, at - age + 1))
    return () => timers.forEach(clearTimeout)
  }, [sample])
  return scanVisibility(sample, mapId, Date.now())
}

/**
 * What the selected robot's lidar sees, live: each point of its latest /scan
 * frame as a small dot, on a canvas (400 points twice a second is nothing to
 * it). The points are already in the map frame, placed with the pose the
 * robot believed, so dots on the map's walls mean the position is right and
 * dots beside them mean it is not. A frame taken against another map is not
 * drawn; one older than 2 s fades, older than 5 s is gone.
 */
export function ScanLayer({ robotId, mapId }: { robotId: string; mapId: string }) {
  const map = useMap()
  const sample = useLatestScan(robotId)
  const visibility = useScanVisibility(sample, mapId)
  const theme = useThemeStore((s) => s.theme)
  const layer = useRef<{ group: L.LayerGroup; renderer: L.Canvas; pane: HTMLElement } | null>(null)

  useEffect(() => {
    const pane = map.getPane(SCAN_PANE) ?? map.createPane(SCAN_PANE)
    pane.style.zIndex = '450'
    pane.style.pointerEvents = 'none'
    const renderer = L.canvas({ pane: SCAN_PANE })
    const group = L.layerGroup().addTo(map)
    layer.current = { group, renderer, pane }
    return () => {
      group.remove()
      renderer.remove()
      layer.current = null
    }
  }, [map])

  useEffect(() => {
    const l = layer.current
    if (!l) return
    l.group.clearLayers()
    if (!sample || visibility === 'hidden') return
    const fill = rgbCss(themeRgb('map-scan', FALLBACK_SCAN))
    l.pane.style.opacity = visibility === 'fading' ? String(FADED_OPACITY) : '1'
    for (const [x, y] of sample.frame.points) {
      L.circleMarker([y, x], {
        renderer: l.renderer, pane: SCAN_PANE, radius: DOT_RADIUS_PX, stroke: false,
        fillColor: fill, fillOpacity: 0.9, interactive: false,
      }).addTo(l.group)
    }
  }, [sample, visibility, theme])

  return null
}
