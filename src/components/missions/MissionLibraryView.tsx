import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowUpRight, CalendarPlus, ChevronLeft, Pencil, Search } from 'lucide-react'
import i18n from '@/i18n'
import { color, font, glass, radius, space } from '@/design-system/tokens'
import { Badge, Button } from '@/components/kit'
import { NameLink } from '@/components/common/NameLink'
import { filterKey, filterLibrary, libraryCard, libraryFilters, previewed, type LibraryFilter } from '@/missions/libraryCards'
import { useTaskStore } from '@/missions/useTaskStore'
import { libraryWindow } from '@/missions/taskPanel'
import { filterByMap, mapFilterOptions, missionMapOf, type MapFilterKey, type MapFilterOption } from '@/missions/missionMaps'
import { useTouchShell } from '@/lib/useTouchShell'
import { useUserNames } from '@/lib/auth/useUserNames'
import { useSiteRobots } from '@/org/useSiteRobots'
import type { MissionLibraryEntry, MissionTask, SiteMap } from '@/types'
import { ChecksBadge, formatDuration, formatLength, inputStyle } from './parts'
import { RoutePreviewMap } from './RoutePreviewMap'
import { RunMissionButton } from './RunMissionButton'
import { ProgramPreview } from './visual-program/ProgramPreview'

function timeAgo(iso: string): string {
  const sec = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (sec < 3600) return i18n.t('missions.library.ageMinutes', { n: Math.max(1, Math.round(sec / 60)) })
  if (sec < 86400) return i18n.t('missions.library.ageHours', { n: Math.round(sec / 3600) })
  return i18n.t('missions.library.ageDays', { n: Math.round(sec / 86400) })
}

/** Space kept clear of the floating title (top) and stats bar (bottom). */
const PREVIEW_PADDING = { topLeft: [24, 96] as [number, number], bottomRight: [24, 112] as [number, number] }
/** Narrow, the title and the stats sit above and below the map rather than over it. */
const STACKED_PREVIEW_PADDING = { topLeft: [16, 16] as [number, number], bottomRight: [16, 16] as [number, number] }

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
 * Only the width changes this layout (2026-11-26). At 700 px and up -- a
 * tablet included -- it is the desktop's two panes, preview and actions and
 * all; on touch a second tap on the card already picked opens the editor,
 * since a double-tap is not a gesture to rely on. Narrow, the list fills the
 * page and a tap shows that mission's preview full width, with the same stats
 * and actions and a way back to the list. A tap there never opens the editor.
 *
 * Schedule, Next run and Last result are gone from here on purpose: they
 * describe tasks, not missions (the 2026-10-23 split), and the Schedule page
 * shows them. A card says only how many tasks use the mission, and links there.
 *
 * Every card names the map its mission is on, from the site's list of maps: a
 * site can hold several, and nothing here hides the missions on the others. A
 * map filter joins the type chips once the missions span two or more maps.
 */
export function MissionLibraryView({ siteId, missions, maps = null, onOpen, onSchedule, onShowTasks, onOpenMap }: {
  siteId: string
  missions: MissionLibraryEntry[]
  /** The site's maps (useSiteMapStore.maps); null until they are known. */
  maps?: readonly SiteMap[] | null
  onOpen: (missionId: string) => void
  /** Starts a new task for this mission. */
  onSchedule: (missionId: string) => void
  /** Goes to the Schedule page. */
  onShowTasks: () => void
  /** Opens a map in the Map workspace. Given, a card's map chip links there. */
  onOpenMap?: (mapId: string) => void
}) {
  const { t } = useTranslation()
  const { touch, narrow } = useTouchShell()
  // Tasks are loaded only to count them per mission. The window is the same
  // floored one the Schedule page asks for, so switching pages reuses it.
  const [now] = useState(() => Date.now())
  const { from, to } = libraryWindow(now)
  const load = useTaskStore((s) => s.load)
  const tasks = useTaskStore((s) => s.tasks)
  const tasksReady = useTaskStore((s) => s.tasksLoaded && !s.error && !s.loading)
  useEffect(() => { void load(siteId, from, to) }, [siteId, from, to, load])
  const robots = useSiteRobots()

  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<LibraryFilter>({ kind: 'all' })
  const [pickedId, setPickedId] = useState<string | null>(null)
  // Narrow only: the list, or the picked mission's preview in its place.
  const [previewOpen, setPreviewOpen] = useState(false)
  const [mapKey, setMapKey] = useState<MapFilterKey>('all')
  const filters = useMemo(() => libraryFilters(missions), [missions])
  const mapOptions = useMemo(() => mapFilterOptions(missions, maps), [missions, maps])
  // A map filter that is no longer offered (a mission moved, a map deleted) shows everything.
  const mapShown = mapOptions.some((o) => o.key === mapKey) ? mapKey : 'all'
  const shown = useMemo(
    () => filterByMap(filterLibrary(missions, filter, q), mapShown, maps),
    [missions, filter, q, mapShown, maps],
  )
  // Narrow, the preview is exactly the mission tapped, never the first in the
  // list; one that has gone (deleted, filtered away) puts the list back.
  const narrowPick = narrow && previewOpen ? shown.find((m) => m.mission_id === pickedId) ?? null : null
  const current = narrow ? narrowPick : previewed(shown, pickedId)
  // The preview's map: drawn only when the site has it (a missing or unknown
  // map is the plain grid, and the card's chip says why).
  const currentMapOf = current ? missionMapOf(current, maps) : null
  const currentMap = currentMapOf?.status === 'map' ? currentMapOf.map : undefined
  // The creator is a user id on the real backend, a plain name in mock mode;
  // an id the names ask does not know stands for itself.
  const creatorNames = useUserNames([current?.creator])
  const creatorName = current ? creatorNames[current.creator] ?? current.creator : ''

  const filterLabel = (f: LibraryFilter) => f.kind === 'all'
    ? t('missions.library.filterAll')
    : f.kind === 'program' ? t('missions.tasks.form.kind.program') : t(`command.taskBar.missionType.${f.type}`)
  const mapOptionLabel = (o: MapFilterOption) => o.kind === 'all' ? t('missions.library.mapFilterAll')
    : o.kind === 'map' ? o.name : t(`missions.library.mapChip.${o.kind}`)

  // What a tap or a click on a card does. Narrow: show its preview, never the
  // editor. Wide with a finger: the first tap previews, a tap on the card the
  // operator already picked opens it. Wide with a mouse: a click previews and
  // a double-click opens, as it always has.
  const pickCard = (id: string) => {
    if (narrow) { setPickedId(id); setPreviewOpen(true); return }
    if (touch && pickedId === id) { onOpen(id); return }
    setPickedId(id)
  }
  const preview = current && (
    <MissionPreview
      siteId={siteId} mission={current} map={currentMap} creatorName={creatorName}
      robots={robots} tasks={tasksReady ? tasks : []}
      stacked={narrow} onSchedule={onSchedule} onOpen={onOpen}
    />
  )

  if (narrow && current) {
    return (
      <div data-library-preview style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0, background: color.surface }}>
        <div style={{ flexShrink: 0, padding: `${space[2]}px ${space[3]}px 0` }}>
          <Button size="sm" variant="ghost" icon={ChevronLeft} onClick={() => setPreviewOpen(false)}>{t('missions.view.missions')}</Button>
        </div>
        {preview}
      </div>
    )
  }

  return (
    <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
      <div style={{ ...(narrow ? { flex: 1, minWidth: 0 } : { width: 340, flexShrink: 0 }), background: color.surface, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ padding: `${space[3]}px ${space[3]}px ${space[2]}px`, display: 'grid', gap: space[2] }}>
          {/* Search and the map filter share a row unless the page is narrow,
              where they sit one above the other. */}
          <div data-library-search-row style={{
            display: 'grid', gap: space[2],
            gridTemplateColumns: !narrow && mapOptions.length > 0
              ? 'minmax(0, 1fr) minmax(0, 140px)' : 'minmax(0, 1fr)',
          }}>
            <div style={{ position: 'relative' }}>
              <Search size={14} color={color.t3} aria-hidden style={{ position: 'absolute', left: 10, top: 9 }} />
              <input
                value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('missions.library.search')}
                aria-label={t('missions.library.search')} style={{ ...inputStyle, width: '100%', paddingLeft: 30 }}
              />
            </div>
            {mapOptions.length > 0 && (
              <select
                value={mapShown} onChange={(e) => setMapKey(e.target.value)} aria-label={t('missions.library.mapFilter')}
                // The search box's height: the two share a row.
                style={{ ...inputStyle, fontSize: font.size.sm }}
              >
                {mapOptions.map((o) => <option key={o.key} value={o.key}>{mapOptionLabel(o)}</option>)}
              </select>
            )}
          </div>
          {/* Kit buttons, not hand-rolled ones: `active` is the kit's own
              pressed look, at the kit's own size in every shell. */}
          {filters.length > 2 && (
            <div role="group" aria-label={t('missions.library.filterAria')} style={{ display: 'flex', flexWrap: 'wrap', gap: space[1] }}>
              {filters.map((f) => {
                const on = filterKey(f) === filterKey(filter)
                return (
                  <Button key={filterKey(f)} size="sm" active={on} onClick={() => setFilter(f)}>
                    {filterLabel(f)}
                  </Button>
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
                onClick={() => pickCard(m.mission_id)}
                // A double-tap is two taps, which pickCard already turns into
                // preview-then-open on touch; narrow, the first tap has left the list.
                onDoubleClick={touch || narrow ? undefined : () => onOpen(m.mission_id)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter' && e.key !== ' ') return
                  e.preventDefault()
                  // The first Enter previews; Enter on the previewed card opens it.
                  // Narrow, it shows the preview in the list's place.
                  if (narrow) pickCard(m.mission_id)
                  else if (on && e.key === 'Enter') onOpen(m.mission_id)
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
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: space[2], minWidth: 0 }}>
                  <span style={{ fontSize: font.size.sm, color: color.t2, minWidth: 0 }}>{kindLine}</span>
                  <MapChip mission={m} maps={maps} onOpenMap={onOpenMap} />
                </div>
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

      {!narrow && <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
        {preview ?? <div style={{ position: 'absolute', inset: 0, background: color.mapBg }} />}
      </div>}
    </div>
  )
}

/**
 * One mission's preview: its route on its map (or its blocks), who made it,
 * its totals, and Schedule / Edit mission / Run. Beside the list, the title
 * and the totals float over the map (`stacked` false). Narrow, the preview
 * has the page to itself and stacks them above and below the map, so the
 * totals and the actions never cover the route on a phone.
 */
function MissionPreview({ siteId, mission: current, map, creatorName, robots, tasks, stacked, onSchedule, onOpen }: {
  siteId: string
  mission: MissionLibraryEntry
  map: SiteMap | undefined
  creatorName: string
  robots: ReturnType<typeof useSiteRobots>
  tasks: MissionTask[]
  stacked: boolean
  onSchedule: (missionId: string) => void
  onOpen: (missionId: string) => void
}) {
  const { t } = useTranslation()
  const canvas = current.kind === 'program'
    // A program has no route to draw, so it shows its blocks instead.
    ? <ProgramPreview state={current.program_state} />
    : (
      <RoutePreviewMap
        missionId={current.mission_id}
        waypoints={current.waypoints}
        map={map}
        flagged={flaggedOf(current)} padding={stacked ? STACKED_PREVIEW_PADDING : PREVIEW_PADDING}
      />
    )
  const title = <>
    <div style={{ fontSize: font.size.lg, fontWeight: font.weight.bold, color: color.t1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{current.name}</div>
    <div style={{ fontSize: font.size.sm, color: color.t2, marginTop: 2 }}>
      {t('missions.library.byline', { who: creatorName, ago: timeAgo(current.updated_at) })}
    </div>
  </>
  const stats = (current.kind === 'route'
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
  ))
  // Right-aligned, so Run stays at the right edge when the row wraps: its
  // robot chooser opens upward from there and would run off a phone's left edge.
  const actions = (
    <div data-library-actions style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: space[2], pointerEvents: 'auto' }}>
      <Button icon={CalendarPlus} onClick={() => onSchedule(current.mission_id)}>{t('missions.editor.schedule')}</Button>
      <Button icon={Pencil} onClick={() => onOpen(current.mission_id)}>{t('missions.library.editMission')}</Button>
      {/* Keyed by mission: a chooser left open belongs to the mission it named. */}
      <RunMissionButton key={current.mission_id} siteId={siteId} mission={current} robots={robots} tasks={tasks} />
    </div>
  )

  if (stacked) {
    return <>
      <div style={{ flexShrink: 0, padding: `${space[2]}px ${space[4]}px` }}>{title}</div>
      <div style={{ flex: 1, position: 'relative', minHeight: 220 }}>{canvas}</div>
      <div style={{ flexShrink: 0, display: 'grid', gap: space[3], padding: space[4] }}>
        <dl style={{ margin: 0, display: 'flex', flexWrap: 'wrap', gap: `${space[2]}px ${space[5]}px` }}>{stats}</dl>
        {actions}
      </div>
    </>
  }
  return <>
    {canvas}
    <div style={{ ...glass.overlay, border: 'none', position: 'absolute', left: space[4], top: space[4], zIndex: 500, maxWidth: 'calc(100% - 32px)', borderRadius: radius.lg, padding: `${space[2]}px ${space[4]}px` }}>
      {title}
    </div>
    <div style={{ position: 'absolute', left: space[4], right: space[4], bottom: space[4], zIndex: 500, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: space[3], flexWrap: 'wrap', pointerEvents: 'none' }}>
      <dl style={{ ...glass.overlay, border: 'none', margin: 0, display: 'flex', gap: space[5], borderRadius: radius.lg, padding: `${space[2]}px ${space[4]}px`, pointerEvents: 'auto' }}>
        {stats}
      </dl>
      {actions}
    </div>
  </>
}

/** The map a card's mission is on: its name, "No map" for none (and for a
 * program, which has no map frame), "Missing map" in amber for an id the site
 * does not have. Nothing until the site's maps are known: "missing" would be
 * a claim. */
function MapChip({ mission, maps, onOpenMap }: {
  mission: MissionLibraryEntry
  maps: readonly SiteMap[] | null
  onOpenMap?: (mapId: string) => void
}) {
  const { t } = useTranslation()
  const of = missionMapOf(mission, maps)
  if (of.status === 'unknown') return null
  if (of.status === 'map' && onOpenMap) {
    // A link to the map, inside a card that previews or opens on click and
    // Enter: the click and the keys that press it stop here.
    const mapId = of.map.map_id
    return (
      <span data-map-chip={of.status} style={{ display: 'inline-flex', flexShrink: 1, minWidth: 0, maxWidth: '55%' }}>
        <button
          type="button" title={t('missions.library.run.openMap')}
          onClick={(e) => { e.stopPropagation(); onOpenMap(mapId) }}
          onDoubleClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation() }}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 2, minWidth: 0, maxWidth: '100%', padding: 0,
            border: 'none', background: 'none', cursor: 'pointer', font: 'inherit', fontSize: font.size.sm, color: color.accent,
          }}
        >
          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{of.map.name}</span>
          <ArrowUpRight size={12} aria-hidden style={{ flexShrink: 0 }} />
        </button>
      </span>
    )
  }
  return (
    <span data-map-chip={of.status} style={{ display: 'inline-flex', flexShrink: 1, minWidth: 0, maxWidth: '55%' }}>
      <Badge
        tone={of.status === 'missing' ? 'amber' : 'neutral'}
        title={of.status === 'missing' ? t('missions.library.mapChipMissingWhy') : of.status === 'map' ? of.map.name : undefined}
        style={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
      >
        {of.status === 'map' ? of.map.name : t(`missions.library.mapChip.${of.status}`)}
      </Badge>
    </span>
  )
}
