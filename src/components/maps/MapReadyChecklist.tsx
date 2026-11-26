import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/kit'
import { Section } from '@/components/fleet/v2/parts'
import { color, font, radius, space } from '@/design-system/tokens'
import { useAuthStore } from '@/lib/auth/authStore'
import { useUserNames } from '@/lib/auth/useUserNames'
import { dataProvider } from '@/lib/realtime/dataProvider'
import { useCan } from '@/org/useCan'
import { robotsForSite } from '@/org/siteRobots'
import type { MapQualityReport } from '@/types/mapPipeline'
import type { SiteMap } from '@/types/maps'
import type { SurveySummary } from '@/types/surveyReplay'
import { resolveSurveySource, type SurveySource } from './editor/findMoving'
import { useProviderRobots } from './useProviderRobots'
import {
  mapReadiness, trackExtent, type ReadinessAction, type ReadinessStep, type StepTone, type WalkedArea,
} from './mapReadiness'

const TONE_DOT: Record<StepTone, string> = { green: color.green, amber: color.amber, red: color.red, grey: color.t3 }

/**
 * the Map workspace's "Get it ready" (map ready spec §3): the nine steps between
 * this floor and a robot walking on it. Reads what the steps need that the
 * page does not already hold -- the floor's survey and its Data › Surveys
 * verdict, the moved list, the walked track -- and leaves every decision to
 * `mapReadiness`. A read that fails leaves its step grey: unknown is never
 * green. Buttons only emit `onAction`; the page does the rest.
 */
export function MapReadyChecklist({ map, floorIndex, maps, quality, qualityRunning, onAction }: {
  map: SiteMap
  floorIndex: number
  maps: SiteMap[]
  /** The page's quality report (undefined: loading). */
  quality: MapQualityReport | null | undefined
  qualityRunning: boolean
  onAction: (action: ReadinessAction) => void
}) {
  const { steps } = useMapReadiness({ map, floorIndex, maps, quality, qualityRunning })
  return <MapReadyRows steps={steps} onAction={onAction} />
}

/** The checklist's steps, and the floor reads behind them, for a page that
 * shows them in more than one place: the Map workspace's Ready n/9 chip and
 * its Setup tab count the same steps, and its Overview names the survey the
 * floor was built from. */
export function useMapReadiness({ map, floorIndex, maps, quality, qualityRunning }: {
  map: SiteMap
  floorIndex: number
  maps: SiteMap[]
  quality: MapQualityReport | null | undefined
  qualityRunning: boolean
}): { steps: ReadinessStep[]; reads: FloorReads } {
  const { t } = useTranslation()
  const all = useProviderRobots()
  const robots = useMemo(() => robotsForSite(all, map.site_id), [all, map.site_id])
  const configure = useCan('configure')
  const editZones = useCan('editZones')
  // An owner/admin only has to turn Engineer tools on (off after every sign-in).
  const engineerToolsSwitch = useAuthStore((s) => s.status === 'signedIn' && s.user?.can_use_engineer_tools === true)
  const reads = useFloorReads(map, floorIndex)
  // Who reviewed the zones is a user id on the real backend.
  const names = useUserNames([map.zones_reviewed_by])

  const steps = mapReadiness({
    t, map, floorIndex, maps, quality, qualityRunning, robots,
    survey: reads.survey, summary: reads.summary, moved: reads.moved, walked: reads.walked,
    can: { configure, editZones, engineerToolsSwitch },
    names,
  })
  return { steps, reads }
}

export interface FloorReads {
  survey: SurveySource | null | undefined
  summary: SurveySummary | null | undefined
  moved: { spots: number } | null | undefined
  walked: WalkedArea | null | undefined
}

/** A provider read as a promise that rejects rather than throws. */
const ask = <T,>(read: () => Promise<T>): Promise<T | undefined> => Promise.resolve().then(read)

const UNREAD: FloorReads = { survey: undefined, summary: undefined, moved: undefined, walked: undefined }

/** The floor's survey (its own record first, the map's jobs as a fallback, as
 * FindMovingPanel does), that survey's summary, the moved list and the walked
 * track -- again after every change to the map. After a save (a new
 * `updated_at`) the previous reads stay on screen until the new ones land, so
 * the rows do not flash grey; another map or floor starts from unread. */
function useFloorReads(map: SiteMap, floorIndex: number): FloorReads {
  const { map_id: mapId, site_id: siteId, updated_at: updatedAt } = map
  const key = `${mapId}/${floorIndex}`
  const [held, setHeld] = useState<{ key: string; reads: FloorReads }>({ key, reads: UNREAD })

  useEffect(() => {
    let cancelled = false
    const update = (patch: Partial<FloorReads>) => {
      if (!cancelled) setHeld((h) => ({ key, reads: { ...(h.key === key ? h.reads : UNREAD), ...patch } }))
    }

    // Every read goes through `ask`, so one that throws or answers nothing
    // leaves its step unknown rather than breaking the page.
    const floorRecord = ask(() => dataProvider.getFloorSurvey(mapId, floorIndex)).catch(() => undefined)
    const jobs = ask(() => dataProvider.listMapJobs(mapId)).then((j) => ({ jobs: j ?? [], failed: false }), () => ({ jobs: [], failed: true }))
    void Promise.all([floorRecord, jobs]).then(([floor, j]) => {
      // Neither the record nor the jobs could be read: unknown, not "none".
      const survey = floor === undefined && j.failed ? undefined : resolveSurveySource(floor, j.jobs, floorIndex)
      update({ survey })
      if (!survey) { update({ summary: survey }); return }
      ask(() => dataProvider.listSurveys({ site_id: siteId })).then(
        (list) => update({ summary: list ? list.items.find((s) => s.survey_id === survey.surveyId) ?? null : undefined }),
        () => update({ summary: undefined }),
      )
    })
    ask(() => dataProvider.getMovedLayer(mapId, floorIndex)).then(
      (layer) => update({ moved: layer ? { spots: layer.blobs.length } : layer === null ? null : undefined }),
      () => update({ moved: undefined }),
    )
    ask(() => dataProvider.getMapFloorFile(mapId, floorIndex, 'track')).then(
      // A track that does not parse is unknown, not missing.
      (data) => update({ walked: data ? trackExtent(data) ?? undefined : data === null ? null : undefined }),
      () => update({ walked: undefined }),
    )
    return () => { cancelled = true }
  }, [key, mapId, siteId, updatedAt, floorIndex])

  return held.key === key ? held.reads : UNREAD
}

/** The rows themselves: a status dot, the step, one line of detail and at most
 * one button. Rows are tinted, never outlined, like Robot maps' rows. */
export function MapReadyRows({ steps, onAction }: { steps: ReadinessStep[]; onAction: (action: ReadinessAction) => void }) {
  const { t } = useTranslation()
  return (
    <Section title={t('missions.maps.ready.title')} span>
      <ol aria-label={t('missions.maps.ready.aria')} style={{
        listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: space[1], maxWidth: 760,
      }}>
        {steps.map((s) => (
          <li key={s.id} data-step={s.id} data-tone={s.tone} style={{
            display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap',
            padding: `${space[2]}px ${space[3]}px`, borderRadius: radius.sm, background: color.hover,
          }}>
            <span role="img" aria-label={t(`missions.maps.ready.tone.${s.tone}`)} style={{
              width: 8, height: 8, borderRadius: radius.full, background: TONE_DOT[s.tone], flexShrink: 0,
            }} />
            <span style={{ display: 'grid', gap: 2, flex: '1 1 180px', minWidth: 0 }}>
              <span style={{ fontSize: font.size.md, fontWeight: font.weight.bold, color: color.t1 }}>
                {t(`missions.maps.ready.steps.${s.id}`)}
              </span>
              <span style={{ fontSize: font.size.sm, color: color.t2, lineHeight: 1.5 }}>{s.detail}</span>
            </span>
            {s.action && (
              <Button size="sm" onClick={() => onAction(s.action!)}>
                {s.action.kind === 'useOnRobot'
                  ? t('missions.maps.ready.actions.useOnRobot', { robot: s.action.robotName })
                  : t(`missions.maps.ready.actions.${s.action.kind}`)}
              </Button>
            )}
          </li>
        ))}
      </ol>
    </Section>
  )
}
