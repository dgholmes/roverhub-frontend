import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CalendarPlus, Code2, Pencil, Search } from 'lucide-react'
import i18n from '@/i18n'
import { color, font, glass, radius, space } from '@/design-system/tokens'
import { Button } from '@/components/kit'
import { NameLink } from '@/components/common/NameLink'
import { filterKey, filterLibrary, libraryCard, libraryFilters, previewed, type LibraryFilter } from '@/missions/libraryCards'
import { useTaskStore } from '@/missions/useTaskStore'
import { libraryWindow } from '@/missions/taskPanel'
import type { MissionLibraryEntry } from '@/types'
import { ChecksBadge, formatDuration, formatLength, inputStyle } from './parts'
import { RoutePreviewMap } from './RoutePreviewMap'

function timeAgo(iso: string): string {
  const sec = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (sec < 3600) return i18n.t('missions.library.ageMinutes', { n: Math.max(1, Math.round(sec / 60)) })
  if (sec < 86400) return i18n.t('missions.library.ageHours', { n: Math.round(sec / 3600) })
  return i18n.t('missions.library.ageDays', { n: Math.round(sec / 86400) })
}

/** Space kept clear of the floating title (top) and stats bar (bottom). */
const PREVIEW_PADDING = { topLeft: [24, 96] as [number, number], bottomRight: [24, 112] as [number, number] }

/** The worst problem on each waypoint, to colour it on the preview. */
function flaggedOf(m: MissionLibraryEntry): Record<string, 'error' | 'warning'> {
  const out: Record<string, 'error' | 'warning'> = {}
  for (const i of m.validation?.issues ?? []) {
    if (i.waypoint_id && i.severity !== 'info' && out[i.waypoint_id] !== 'error') out[i.waypoint_id] = i.severity as 'error' | 'warning'
  }
  return out
}

function worstTone(m: MissionLibraryEntry): string | null {
  const issues = m.validation?.issues ?? []
  if (issues.some((i) => i.severity === 'error')) return color.red
  if (issues.some((i) => i.severity === 'warning')) return color.amber
  return null
}

/**
 * The site's missions as cards beside a map preview (docs/05-ui-ux.md §11.1,
 * and FlightHub 2's route library). Clicking a card previews it; a
 * double-click, Enter twice or Edit mission opens the editor.
 *
 * Schedule, Next run and Last result are gone from here on purpose: they
 * describe tasks, not missions (the 2026-10-23 split), and the Schedule page
 * shows them. A card says only how many tasks use the mission, and links there.
 */
export function MissionLibraryView({ siteId, missions, onOpen, onSchedule, onShowTasks }: {
  siteId: string
  missions: MissionLibraryEntry[]
  onOpen: (missionId: string) => void
  /** Starts a new task for this mission. */
  onSchedule: (missionId: string) => void
  /** Goes to the Schedule page. */
  onShowTasks: () => void
}) {
  const { t } = useTranslation()
  // Tasks are loaded only to count them per mission. The window is the same
  // floored one the Schedule page asks for, so switching pages reuses it.
  const [now] = useState(() => Date.now())
  const { from, to } = libraryWindow(now)
  const load = useTaskStore((s) => s.load)
  const tasks = useTaskStore((s) => s.tasks)
  const tasksReady = useTaskStore((s) => s.tasksLoaded && !s.error && !s.loading)
  useEffect(() => { void load(siteId, from, to) }, [siteId, from, to, load])

  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<LibraryFilter>({ kind: 'all' })
  const [pickedId, setPickedId] = useState<string | null>(null)
  const filters = useMemo(() => libraryFilters(missions), [missions])
  const shown = useMemo(() => filterLibrary(missions, filter, q), [missions, filter, q])
  const current = previewed(shown, pickedId)

  const filterLabel = (f: LibraryFilter) => f.kind === 'all'
    ? t('missions.library.filterAll')
    : f.kind === 'program' ? t('missions.tasks.form.kind.program') : t(`command.taskBar.missionType.${f.type}`)

  return (
    <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
      <div style={{ width: 340, flexShrink: 0, background: color.surface, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ padding: `${space[3]}px ${space[3]}px ${space[2]}px`, display: 'grid', gap: space[2] }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} color={color.t3} aria-hidden style={{ position: 'absolute', left: 10, top: 9 }} />
            <input
              value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('missions.library.search')}
              aria-label={t('missions.library.search')} style={{ ...inputStyle, width: '100%', paddingLeft: 30 }}
            />
          </div>
          {filters.length > 2 && (
            <div role="group" aria-label={t('missions.library.filterAria')} style={{ display: 'flex', flexWrap: 'wrap', gap: space[1] }}>
              {filters.map((f) => {
                const on = filterKey(f) === filterKey(filter)
                return (
                  <button
                    key={filterKey(f)} type="button" aria-pressed={on} onClick={() => setFilter(f)}
                    style={{
                      padding: '3px 9px', borderRadius: radius.sm, border: 'none', cursor: 'pointer',
                      fontFamily: font.family, fontSize: font.size.sm, fontWeight: font.weight.medium,
                      background: on ? color.accentDim : color.card, color: on ? color.accent : color.t2,
                    }}
                  >
                    {filterLabel(f)}
                  </button>
                )
              })}
            </div>
          )}
        </div>
        <div role="listbox" aria-label={t('missions.library.listAria')} style={{ flex: 1, overflowY: 'auto', padding: `0 ${space[2]}px ${space[3]}px` }}>
          {shown.map((m) => {
            const on = m.mission_id === current?.mission_id
            const card = libraryCard(m, tasksReady ? tasks : null)
            const tone = worstTone(m)
            const kindLine = [
              t(`command.taskBar.missionType.${m.type}`),
              t(`missions.tasks.form.kind.${m.kind}`),
              ...(m.kind === 'route' ? [t('missions.library.stepCount', { count: card.steps })] : []),
            ].join(' · ')
            return (
              <div
                key={m.mission_id} role="option" aria-selected={on} tabIndex={0}
                onClick={() => setPickedId(m.mission_id)}
                onDoubleClick={() => onOpen(m.mission_id)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter' && e.key !== ' ') return
                  e.preventDefault()
                  // The first Enter previews; Enter on the previewed card opens it.
                  if (on && e.key === 'Enter') onOpen(m.mission_id)
                  else setPickedId(m.mission_id)
                }}
                className="rh-libcard"
                style={{
                  display: 'grid', gap: 4, padding: `${space[2] + 2}px ${space[3]}px`, marginBottom: space[1],
                  borderRadius: radius.md, cursor: 'pointer', background: on ? color.selected : 'transparent',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: space[2], minWidth: 0 }}>
                  {tone && <span aria-hidden style={{ width: 7, height: 7, borderRadius: '50%', background: tone, flexShrink: 0 }} />}
                  <span style={{ flex: 1, minWidth: 0, fontSize: font.size.md, fontWeight: font.weight.semibold, color: color.t1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={m.name}>
                    {m.name}
                  </span>
                  <ChecksBadge validation={m.validation} />
                </div>
                <span style={{ fontSize: font.size.sm, color: color.t2 }}>{kindLine}</span>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: space[2], fontSize: font.size.sm, color: color.t3 }}>
                  <span>
                    {card.taskCount === null ? '' : card.taskCount === 0
                      ? t('missions.library.noTasks')
                      : <NameLink onClick={onShowTasks}>{t('missions.library.usedBy', { count: card.taskCount })}</NameLink>}
                  </span>
                  <span>{timeAgo(m.updated_at)}</span>
                </div>
              </div>
            )
          })}
          {shown.length === 0 && (
            <div style={{ padding: space[4], color: color.t3, fontSize: font.size.md }}>
              {missions.length === 0 ? t('missions.library.empty') : t('missions.library.noMatch')}
            </div>
          )}
        </div>
      </div>

      <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
        {current ? <>
          <RoutePreviewMap
            missionId={current.mission_id}
            waypoints={current.kind === 'route' ? current.waypoints : []}
            flagged={flaggedOf(current)} padding={PREVIEW_PADDING}
          />
          <div style={{ ...glass.overlay, border: 'none', position: 'absolute', left: space[4], top: space[4], zIndex: 500, maxWidth: 'calc(100% - 32px)', borderRadius: radius.lg, padding: `${space[2]}px ${space[4]}px` }}>
            <div style={{ fontSize: font.size.lg, fontWeight: font.weight.bold, color: color.t1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{current.name}</div>
            <div style={{ fontSize: font.size.sm, color: color.t2, marginTop: 2 }}>
              {t('missions.library.byline', { who: current.creator, ago: timeAgo(current.updated_at) })}
            </div>
          </div>
          {current.kind === 'program' && (
            <div style={{ ...glass.overlay, border: 'none', position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', zIndex: 500, maxWidth: 360, borderRadius: radius.lg, padding: `${space[3]}px ${space[4]}px`, display: 'flex', gap: space[3], alignItems: 'flex-start' }}>
              <Code2 size={18} strokeWidth={1.75} color={color.t2} aria-hidden style={{ flexShrink: 0, marginTop: 2 }} />
              <span style={{ fontSize: font.size.md, color: color.t2, lineHeight: 1.5 }}>{t('missions.library.programNoRoute')}</span>
            </div>
          )}
          <div style={{ position: 'absolute', left: space[4], right: space[4], bottom: space[4], zIndex: 500, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: space[3], flexWrap: 'wrap', pointerEvents: 'none' }}>
            <dl style={{ ...glass.overlay, border: 'none', margin: 0, display: 'flex', gap: space[5], borderRadius: radius.lg, padding: `${space[2]}px ${space[4]}px`, pointerEvents: 'auto' }}>
              {(current.kind === 'route'
                ? [
                    [t('missions.editor.totalLength'), formatLength(current.estimates?.length_m)],
                    [t('missions.editor.totalTime'), formatDuration(current.estimates?.duration_s)],
                    [t('missions.editor.totalStepsLabel'), String(current.waypoints.length)],
                    [t('missions.library.photos'), String(libraryCard(current, null).photos)],
                  ]
                : [[t('missions.editor.totalTime'), formatDuration(current.estimates?.duration_s)]]
              ).map(([k, v]) => (
                <div key={k}>
                  <dt style={{ fontSize: font.size.xs, color: color.t3 }}>{k}</dt>
                  <dd style={{ margin: 0, fontSize: font.size.xl, fontWeight: font.weight.semibold, color: color.t1, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{v}</dd>
                </div>
              ))}
            </dl>
            <div style={{ display: 'flex', gap: space[2], pointerEvents: 'auto' }}>
              <Button icon={CalendarPlus} onClick={() => onSchedule(current.mission_id)}>{t('missions.editor.schedule')}</Button>
              <Button variant="primary" icon={Pencil} onClick={() => onOpen(current.mission_id)}>{t('missions.library.editMission')}</Button>
            </div>
          </div>
        </> : (
          <div style={{ position: 'absolute', inset: 0, background: color.mapBg }} />
        )}
      </div>
    </div>
  )
}
