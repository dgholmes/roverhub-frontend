import { useCallback, useState } from 'react'

/**
 * The LiveOps map's two survey layers -- Walkable area and Live lidar -- as the
 * operator last left them, remembered per browser. Both start ON: they are how
 * an operator sees why a goal will be refused and whether the robot's position
 * is right, so hiding them is the choice, not showing them.
 *
 * A per-viewer convenience: every read and write is wrapped, and a browser
 * that refuses storage starts with both on each time.
 */
export interface SurveyLayerPrefs {
  walkable: boolean
  lidar: boolean
}

export const DEFAULT_SURVEY_LAYERS: Readonly<SurveyLayerPrefs> = Object.freeze({ walkable: true, lidar: true })

export const SURVEY_LAYERS_KEY = 'rh.liveops.surveyLayers'

/** What this browser remembered. Anything missing or unreadable is ON. */
export function loadSurveyLayers(): SurveyLayerPrefs {
  try {
    const raw = localStorage.getItem(SURVEY_LAYERS_KEY)
    if (!raw) return { ...DEFAULT_SURVEY_LAYERS }
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return { ...DEFAULT_SURVEY_LAYERS }
    const p = parsed as Partial<Record<keyof SurveyLayerPrefs, unknown>>
    return {
      walkable: typeof p.walkable === 'boolean' ? p.walkable : DEFAULT_SURVEY_LAYERS.walkable,
      lidar: typeof p.lidar === 'boolean' ? p.lidar : DEFAULT_SURVEY_LAYERS.lidar,
    }
  } catch {
    return { ...DEFAULT_SURVEY_LAYERS }
  }
}

export function saveSurveyLayers(prefs: SurveyLayerPrefs): void {
  try {
    localStorage.setItem(SURVEY_LAYERS_KEY, JSON.stringify({ walkable: prefs.walkable, lidar: prefs.lidar }))
  } catch { /* per-viewer convenience only */ }
}

/** The two switches, read once on mount and written on every change. */
export function useSurveyLayers(): [SurveyLayerPrefs, (key: keyof SurveyLayerPrefs) => void] {
  const [prefs, setPrefs] = useState<SurveyLayerPrefs>(loadSurveyLayers)
  const toggle = useCallback((key: keyof SurveyLayerPrefs) => {
    setPrefs((p) => {
      const next = { ...p, [key]: !p[key] }
      saveSurveyLayers(next)
      return next
    })
  }, [])
  return [prefs, toggle]
}
