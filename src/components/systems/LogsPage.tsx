import { memo, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowDown, ChevronDown, RotateCw, Search, X } from 'lucide-react'
import { color, font, radius, space } from '@/design-system/tokens'
import { Button, ICON } from '@/components/kit'
import { formatLocale } from '@/i18n'
import { useSiteRobots } from '@/org/useSiteRobots'
import type { RobotState } from '@/types'
import type { LogLevel, LogSource } from '@/types/logs'
import {
  DEFAULT_LOG_FILTER, FOLLOWING, LEVEL_CHIPS, LOG_RANGES, filterLogLines, followReducer, formatLogTime, isWaiting,
  unseenCount, withDayDividers, type LevelChip, type LogEntry, type LogFilter, type LogRange, type LogRow,
} from '@/systems/robotLogs'
import { useRobotLogs } from '@/systems/useRobotLogs'

/** Monospace for the rows, as the operator chose (the same stack the edge
 * device tab uses). */
const MONO = "ui-monospace, 'Cascadia Mono', Menlo, Consolas, monospace"
/** Below this card width the row puts the message on its own line. */
const NARROW_PX = 600
/** Within this of the end counts as "at the bottom". */
const BOTTOM_SLACK_PX = 24

const robotStorageKey = (siteId: string) => `rh.systems.logs.robot.${siteId}`
function readStoredRobot(siteId: string): string | null {
  try { return localStorage.getItem(robotStorageKey(siteId)) } catch { return null }
}
function storeRobot(siteId: string, robotId: string): void {
  try { localStorage.setItem(robotStorageKey(siteId), robotId) } catch { /* private window, blocked storage */ }
}

/** The robot shown when none has been chosen here: the first whose bridge is
 * up (it is the one that can answer), else the first. */
export function defaultLogRobot(robots: RobotState[]): string | null {
  return (robots.find((r) => r.connectivity.bridge_state === 'connected') ?? robots[0])?.robot_id ?? null
}

const LEVEL_DOT: Record<LogLevel, string> = { debug: color.t3, info: color.t3, warn: color.amber, error: color.red }
/** A goal that succeeded gets a green dot: the line the operator looks for. */
const isSuccess = (e: LogEntry) => e.level === 'info' && /\bsucceeded\b/i.test(e.message)

/** A chip in the header: tinted when on, never outlined. */
function Chip({ on, onClick, children, title }: { on: boolean; onClick: () => void; children: React.ReactNode; title?: string }) {
  return (
    <Button size="sm" active={on} onClick={onClick} title={title}
      style={{ borderColor: 'transparent', ...(on ? {} : { color: color.t2 }) }}>
      {children}
    </Button>
  )
}

const chipBox: React.CSSProperties = {
  position: 'relative', display: 'inline-flex', alignItems: 'center', height: 28, borderRadius: 6,
  background: color.card, color: color.t1, flexShrink: 0,
}
const chipControl: React.CSSProperties = {
  height: 28, border: 0, background: 'transparent', color: 'inherit', fontFamily: font.family,
  fontSize: font.size.sm, fontWeight: 500, outlineOffset: 0,
}

/** One line. Memoised: a live line re-renders the list, not every row. */
const LineRow = memo(function LineRow({ entry, narrow }: { entry: LogEntry; narrow: boolean }) {
  const { t } = useTranslation()
  const dot = isSuccess(entry) ? color.green : LEVEL_DOT[entry.level]
  const last = entry.last_at ? formatLogTime(Date.parse(entry.last_at)) : formatLogTime(entry.t)
  return (
    <div role="row" data-level={entry.level} data-source={entry.source} style={{
      display: 'grid', gridTemplateColumns: narrow ? 'auto auto 1fr' : '92px 64px 72px minmax(0, 1fr)',
      columnGap: narrow ? space[3] : space[4], rowGap: 2, padding: `${space[1] + 2}px 0`, alignItems: 'baseline',
      fontFamily: MONO, fontSize: font.size.md, lineHeight: 1.55,
    }}>
      <span role="cell" style={{ color: color.t3, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{formatLogTime(entry.t)}</span>
      <span role="cell" style={{ color: color.t3, whiteSpace: 'nowrap' }}>{t(`systems.logs.sourceWord.${entry.source}`)}</span>
      <span role="cell" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: color.t2, whiteSpace: 'nowrap' }}>
        <span aria-hidden style={{ width: 7, height: 7, borderRadius: '50%', background: dot, flexShrink: 0 }} />
        {t(`systems.logs.levelWord.${entry.level}`)}
      </span>
      <span role="cell" title={entry.logger ?? undefined} style={{
        color: color.t1, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', minWidth: 0,
        ...(narrow ? { gridColumn: '1 / -1' } : {}),
      }}>
        {entry.message}
        {entry.repeat > 1 && (
          <span title={t('systems.logs.repeatTitle', { count: entry.repeat, last })} style={{
            display: 'inline-block', marginLeft: space[2], padding: '0 7px', borderRadius: radius.full,
            background: color.hover, color: color.t2, fontSize: font.size.xs, lineHeight: '18px',
            fontVariantNumeric: 'tabular-nums', verticalAlign: 1, cursor: 'default',
          }}>
            {t('systems.logs.repeat', { count: entry.repeat })}
          </span>
        )}
      </span>
    </div>
  )
})

function DayRow({ t }: { t: number }) {
  const label = new Date(t).toLocaleDateString(formatLocale(), { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  return (
    <div role="row" style={{ padding: `${space[3]}px 0 ${space[1]}px`, fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.t2 }}>
      <span role="cell">{label}</span>
    </div>
  )
}

type Tone = 'amber' | 'red' | 'neutral'
const NOTICE_BG: Record<Tone, string> = { amber: color.amberBg, red: color.redBg, neutral: color.hover }

function Notice({ tone, children, lead, hint, onRetry }: { tone: Tone; children: React.ReactNode; lead?: string; hint?: string; onRetry?: () => void }) {
  const { t } = useTranslation()
  return (
    <div role={tone === 'neutral' ? 'status' : 'alert'} style={{
      display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap',
      padding: `${space[2]}px ${space[3]}px`, borderRadius: radius.md, background: NOTICE_BG[tone],
      fontSize: font.size.md, color: color.t1, lineHeight: 1.45,
    }}>
      <div style={{ flex: '1 1 240px', minWidth: 0 }}>
        {lead && <div style={{ fontSize: font.size.sm, color: color.t2, marginBottom: 2, wordBreak: 'keep-all' }}>{lead}</div>}
        <div style={{ overflowWrap: 'anywhere', wordBreak: 'keep-all' }}>{children}</div>
        {hint && <div style={{ fontSize: font.size.sm, color: color.t2, marginTop: 2 }}>{hint}</div>}
      </div>
      {onRetry && <Button size="sm" icon={RotateCw} onClick={onRetry}>{t('systems.logs.retry')}</Button>}
    </div>
  )
}

/**
 * Systems › Logs: one robot's own log, as the operator would read it over SSH
 * -- the bridge's lines and, behind the Nav2 chip, Nav2's warnings and errors.
 * History back to the chosen range is fetched from the robot when the page
 * opens or the robot or range changes; live lines join the same list. Newest
 * at the bottom, following live until the operator scrolls up.
 */
export function LogsPage({ siteId }: { siteId: string }) {
  const { t } = useTranslation()
  const robots = useSiteRobots()
  const [chosen, setChosen] = useState<string | null>(() => readStoredRobot(siteId))
  const robotId = chosen && robots.some((r) => r.robot_id === chosen) ? chosen : defaultLogRobot(robots)
  const robot = robots.find((r) => r.robot_id === robotId) ?? null
  const robotName = robot?.name ?? robotId ?? ''
  const [range, setRange] = useState<LogRange>(1)
  const [filter, setFilter] = useState<LogFilter>(DEFAULT_LOG_FILTER)
  const { state, retry } = useRobotLogs(robotId, range)

  const visible = useMemo(() => filterLogLines(state.lines, filter), [state.lines, filter])
  const rows = useMemo(() => withDayDividers(visible), [visible])
  const navHidden = useMemo(() => filter.sources.nav ? 0
    : filterLogLines(state.lines, { ...filter, sources: { ...filter.sources, nav: true } }).length - visible.length,
  [state.lines, filter, visible])

  // --- Narrow layout, from the card's own width
  const cardRef = useRef<HTMLDivElement>(null)
  const [narrow, setNarrow] = useState(false)
  useEffect(() => {
    const el = cardRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setNarrow(el.clientWidth < NARROW_PX))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // --- Follow live
  const listRef = useRef<HTMLDivElement>(null)
  const [follow, dispatchFollow] = useReducer(followReducer, FOLLOWING)
  const newestT = visible.length ? visible[visible.length - 1].t : null
  const unseen = unseenCount(visible, follow)
  useEffect(() => { dispatchFollow({ type: 'jump' }) }, [robotId, range])
  // Also on `narrow`: the switch re-wraps every row after the first paint.
  useLayoutEffect(() => {
    const el = listRef.current
    if (el && follow.following) el.scrollTop = el.scrollHeight
  }, [rows, follow, narrow])
  const onScroll = () => {
    const el = listRef.current
    if (!el) return
    dispatchFollow({ type: 'scrolled', atBottom: el.scrollHeight - el.scrollTop - el.clientHeight <= BOTTOM_SLACK_PX, newestT })
  }

  const choose = (id: string) => { setChosen(id); storeRobot(siteId, id) }
  const toggleSource = (s: LogSource) => setFilter((f) => ({ ...f, sources: { ...f.sources, [s]: !f.sources[s] } }))
  const toggleLevel = (l: LevelChip) => setFilter((f) => ({ ...f, levels: { ...f.levels, [l]: !f.levels[l] } }))

  const phase = state.phase
  const waiting = isWaiting(phase)

  if (robots.length === 0) {
    return (
      <div style={{ flex: 1, padding: space[4], color: color.t3, fontSize: font.size.md }}>{t('systems.logs.noRobots')}</div>
    )
  }

  const notice = phase.kind === 'offline'
    ? <Notice tone="amber" hint={t('systems.logs.offlineHint')} onRetry={retry}>
      {phase.detail ? t('systems.logs.offline', { detail: phase.detail }) : t('systems.logs.offlineFallback', { robot: robotName })}
    </Notice>
    : phase.kind === 'noAnswer' ? <Notice tone="amber" onRetry={retry}>{t('systems.logs.noAnswer', { robot: robotName })}</Notice>
    : phase.kind === 'requestFailed' ? <Notice tone="red" onRetry={retry}>{t('systems.logs.requestFailed', { robot: robotName, detail: phase.detail })}</Notice>
    : phase.kind === 'deviceError' ? <Notice tone="red" lead={t('systems.logs.deviceErrorHint', { robot: robotName })} onRetry={retry}><span style={{ fontFamily: MONO, whiteSpace: 'pre-wrap' }}>{phase.error}</span></Notice>
    : null

  // What fills the list when it has no rows. Never blank.
  const quiet = visible.length > 0 ? null
    : waiting ? t(phase.kind === 'loading' ? 'systems.logs.loading' : 'systems.logs.receiving', { robot: robotName })
    : state.lines.length > 0 ? t('systems.logs.noMatch')
    : phase.kind === 'ready' ? t(`systems.logs.empty.${range}`)
    : null

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: space[4] }}>
      <div ref={cardRef} style={{
        flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column',
        background: color.surface, borderRadius: radius.xl, overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: space[2], padding: `${space[4]}px ${space[5]}px ${space[3]}px` }}>
          {robots.length > 1 ? (
            <div style={{ ...chipBox, background: 'transparent', marginLeft: -space[2] }}>
              <select
                aria-label={t('systems.logs.robotAria')} value={robotId ?? ''} onChange={(e) => choose(e.target.value)}
                style={{ ...chipControl, appearance: 'none', padding: `0 ${space[6]}px 0 ${space[2]}px`, fontSize: font.size.lg, fontWeight: font.weight.bold, cursor: 'pointer', maxWidth: '100%' }}
              >
                {robots.map((r) => <option key={r.robot_id} value={r.robot_id}>{r.name}</option>)}
              </select>
              <ChevronDown size={14} strokeWidth={ICON.stroke} aria-hidden style={{ position: 'absolute', right: 6, pointerEvents: 'none', color: color.t2 }} />
            </div>
          ) : (
            <h2 style={{ margin: 0, fontSize: font.size.lg, fontWeight: font.weight.bold, color: color.t1 }}>{robotName}</h2>
          )}
          <span style={{ flex: 1 }} />
          <div role="group" aria-label={t('systems.logs.filtersAria')} style={{ display: 'flex', flexWrap: 'wrap', gap: space[2], alignItems: 'center' }}>
            {(['bridge', 'nav'] as const).map((s) => (
              <Chip key={s} on={filter.sources[s]} onClick={() => toggleSource(s)} title={t(`systems.logs.sourceTitle.${s}`)}>
                {t(`systems.logs.source.${s}`)}
              </Chip>
            ))}
            {LEVEL_CHIPS.map((l) => (
              <Chip key={l} on={filter.levels[l]} onClick={() => toggleLevel(l)}>{t(`systems.logs.level.${l}`)}</Chip>
            ))}
            <div style={chipBox}>
              <select
                aria-label={t('systems.logs.rangeAria')} value={range} onChange={(e) => setRange(Number(e.target.value) as LogRange)}
                style={{ ...chipControl, appearance: 'none', padding: '0 26px 0 10px', cursor: 'pointer' }}
              >
                {LOG_RANGES.map((h) => <option key={h} value={h}>{t(`systems.logs.range.${h}`)}</option>)}
              </select>
              <ChevronDown size={13} strokeWidth={ICON.stroke} aria-hidden style={{ position: 'absolute', right: 8, pointerEvents: 'none', color: color.t2 }} />
            </div>
            <div style={{ ...chipBox, color: color.t2 }}>
              <Search size={13} strokeWidth={ICON.stroke} aria-hidden style={{ position: 'absolute', left: 9, pointerEvents: 'none' }} />
              <input
                type="search" aria-label={t('systems.logs.searchAria')} placeholder={t('systems.logs.search')}
                value={filter.query} onChange={(e) => setFilter((f) => ({ ...f, query: e.target.value }))}
                onKeyDown={(e) => { if (e.key === 'Escape') setFilter((f) => ({ ...f, query: '' })) }}
                style={{ ...chipControl, color: color.t1, width: 140, padding: `0 ${filter.query ? 26 : 10}px 0 28px`, borderRadius: 6 }}
              />
              {filter.query && (
                <button type="button" aria-label={t('systems.logs.clearSearch')} onClick={() => setFilter((f) => ({ ...f, query: '' }))}
                  style={{ position: 'absolute', right: 4, width: 20, height: 20, display: 'grid', placeItems: 'center', border: 0, borderRadius: 4, background: 'transparent', color: color.t2, cursor: 'pointer' }}>
                  <X size={12} strokeWidth={ICON.stroke} aria-hidden />
                </button>
              )}
            </div>
          </div>
        </div>

        {(notice || state.truncated) && (
          <div style={{ display: 'grid', gap: space[2], padding: `0 ${space[5]}px ${space[2]}px` }}>
            {notice}
            {state.truncated && <div role="status" style={{ fontSize: font.size.sm, color: color.t3 }}>{t('systems.logs.truncated')}</div>}
          </div>
        )}

        <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div
            ref={listRef} onScroll={onScroll} role="table" aria-label={t('systems.logs.listAria', { robot: robotName })}
            aria-busy={waiting}
            style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', padding: `0 ${space[5]}px ${space[2]}px` }}
          >
            {quiet ? (
              <div role="status" style={{ padding: `${space[8]}px 0`, textAlign: 'center', color: color.t3, fontSize: font.size.md, display: 'grid', gap: space[1], wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>
                <span>{quiet}</span>
                {!waiting && navHidden > 0 && <span style={{ fontSize: font.size.sm }}>{t('systems.logs.navHidden', { count: navHidden })}</span>}
              </div>
            ) : (
              rows.map((row: LogRow) => row.kind === 'day'
                ? <DayRow key={row.key} t={row.t} />
                : <LineRow key={row.entry.key} entry={row.entry} narrow={narrow} />)
            )}
          </div>
          {!follow.following && (
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: space[3], display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
              <Button size="sm" variant="primary" icon={ArrowDown} style={{ pointerEvents: 'auto' }}
                onClick={() => dispatchFollow({ type: 'jump' })}>
                {unseen > 0 ? t('systems.logs.jumpNew', { count: unseen }) : t('systems.logs.jump')}
              </Button>
            </div>
          )}
        </div>

        <div style={{ padding: `${space[3]}px ${space[5]}px ${space[4]}px`, fontSize: font.size.sm, color: color.t3, lineHeight: 1.45, wordBreak: 'keep-all' }}>
          {t('systems.logs.footnote')}
        </div>
      </div>
    </div>
  )
}
