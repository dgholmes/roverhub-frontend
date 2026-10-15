import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Camera, Film, ScanEye } from 'lucide-react'
import { formatLocale } from '@/i18n'
import { color, font, radius, space } from '@/design-system/tokens'
import { Badge, type Tone } from '@/components/kit'
import { dataProvider } from '@/lib/realtime/dataProvider'
import { useSiteRobots } from '@/org/useSiteRobots'
import { Placeholder, SampleBadge } from '@/components/org/parts'
import { formatDuration } from '@/components/missions/parts'
import { runDurationMs } from '@/data/runTimeline'
import type { RunPage, RunResult } from '@/types'

const TONE: Record<RunResult, Tone> = { running: 'accent', completed: 'green', aborted: 'amber', failed: 'red' }
const COLS = 'minmax(200px, 2fr) minmax(120px, 1fr) 150px 90px 110px 150px 90px'

export function RunsView({ siteId, onOpen }: { siteId: string; onOpen: (runId: string) => void }) {
  const { t } = useTranslation()
  const robots = useSiteRobots()
  const [page, setPage] = useState<RunPage | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    dataProvider.listRuns({ site_id: siteId, limit: 200 })
      .then((p) => { if (!cancelled) setPage(p) })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)) })
    return () => { cancelled = true }
  }, [siteId])

  if (error) return <Placeholder title={t('data.runs.errorTitle')}>{t('data.runs.errorBody', { error })}</Placeholder>
  if (!page) return <div style={{ fontSize: font.size.md, color: color.t3 }}>{t('data.loading')}</div>
  if (page.items.length === 0) return <Placeholder title={t('data.runs.emptyTitle')}>{t('data.runs.emptyBody')}</Placeholder>

  return (
    <div style={{ display: 'grid', gap: space[2] }}>
      {page.sample && <div><SampleBadge /></div>}
      <div role="table" style={{ overflowX: 'auto' }}>
        <div role="row" style={{ display: 'grid', gridTemplateColumns: COLS, gap: space[3], padding: `${space[1]}px ${space[3]}px`, fontSize: font.size.sm, color: color.t3, minWidth: 900 }}>
          {(['mission', 'robot', 'started', 'duration', 'result', 'media', 'bucket'] as const).map((c) => <span key={c} role="columnheader">{t(`data.runs.col.${c}`)}</span>)}
        </div>
        {page.items.map((r) => (
          <button key={r.run_id} role="row" type="button" onClick={() => onOpen(r.run_id)}
            style={{ display: 'grid', gridTemplateColumns: COLS, gap: space[3], alignItems: 'center', width: '100%', minWidth: 900,
              padding: space[3], border: 'none', borderRadius: radius.md, background: 'transparent', textAlign: 'left',
              cursor: 'pointer', fontFamily: font.family, fontSize: font.size.md, color: color.t1 }}
            onMouseEnter={(e) => { e.currentTarget.style.background = color.selected }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}>
            <span style={{ fontWeight: font.weight.semibold }}>{r.mission.name}</span>
            <span style={{ color: color.t2 }}>{robots.find((x) => x.robot_id === r.robot_id)?.name ?? r.robot_id}</span>
            <span style={{ color: color.t2, fontVariantNumeric: 'tabular-nums' }}>{new Date(r.started_at).toLocaleString(formatLocale(), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
            <span style={{ color: color.t2 }}>{formatDuration(runDurationMs(r) / 1000)}</span>
            <span><Badge tone={TONE[r.result]}>{t(`data.runs.result.${r.result}`)}</Badge></span>
            <span style={{ display: 'flex', gap: space[3], color: color.t2, fontSize: font.size.sm }}>
              <span title={t('data.runs.photos')}><Camera size={13} aria-hidden /> {r.photo_count}</span>
              <span title={t('data.runs.videos')}><Film size={13} aria-hidden /> {r.video_count}</span>
              <span title={t('data.runs.detections')}><ScanEye size={13} aria-hidden /> {r.detection_count}</span>
            </span>
            <span style={{ color: r.bucket_copied_at ? color.t1 : color.t3 }}>{r.bucket_copied_at ? t('data.runs.copied') : '—'}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
