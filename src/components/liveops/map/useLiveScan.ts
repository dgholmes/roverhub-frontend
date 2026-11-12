import { useEffect, useReducer, useState } from 'react'
import { dataProvider } from '@/lib/realtime/dataProvider'
import { scanVisibility, SCAN_FADE_MS, SCAN_HIDE_MS, type ScanSample, type ScanVisibility } from '@/liveops/scanFrame'

/**
 * The selected robot's live lidar, outside any map library: what ScanLayer
 * draws on the flat map and LiveScene hands the 3D scene. No Leaflet here, so
 * the scene's chunk does not need it.
 */

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
