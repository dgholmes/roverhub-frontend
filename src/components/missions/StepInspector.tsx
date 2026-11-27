import { useTranslation } from 'react-i18next'
import { Trash2 } from 'lucide-react'
import { color, font, radius, space } from '@/design-system/tokens'
import { Button } from '@/components/kit'
import { EstimatedBadge } from '@/components/common/EstimatedBadge'
import { DEFAULT_SPEED_MPS, segmentInto } from '@/missions/estimates'
import { ROUTE_GAITS, ROUTE_GAITS_AVAILABLE, type MissionLibraryEntry, type MissionWaypoint, type RobotType, type Segment, type SegmentGait } from '@/types'
import { Field, IssueList, NumberInput, ReadOnlyForm, inputStyle } from './parts'
import { WaypointActionList } from './WaypointActionList'

const blankSegment = (from: string, to: string): Segment =>
  ({ from_waypoint_id: from, to_waypoint_id: to, speed_mps: null, gait: null, posture: null, wheel_leg_mode: null })

function H({ children }: { children: React.ReactNode }) {
  return <h3 style={{ margin: 0, fontSize: font.size.md, fontWeight: font.weight.bold, color: color.t1 }}>{children}</h3>
}

/**
 * The right-hand pane. With a waypoint selected: where it is, what happens
 * there, the leg into it and its own problems. With none: the whole
 * mission's checks.
 */
export function StepInspector({ siteId, ownerId, mission, selected, onUpdateWaypoint, onUpdateSegment, onRemove, onSelect, readOnly = false, stacked = false }: {
  siteId: string
  /** Whose clip library new clips go to: the robot the mission's tasks use, else the site. */
  ownerId: string
  mission: MissionLibraryEntry
  selected: MissionWaypoint | null
  /** The type of robot the mission's tasks use. The gait choices no longer
   * depend on it (a route offers its own gaits); kept for the caller's sake. */
  robotType: RobotType | null
  onUpdateWaypoint: (id: string, patch: Partial<MissionWaypoint>) => void
  onUpdateSegment: (seg: Segment) => void
  onRemove: (id: string) => void
  onSelect: (id: string) => void
  /** Read the step without changing it (the touch console, M4 §7.6.3). What
   * changes the step is disabled; what a reader needs stays live -- the
   * mission's checks, which are how they walk to a flagged step, and the
   * action rows, which have to be opened to be read. */
  readOnly?: boolean
  /** The editor has stacked its panes into one scrolling column (touch): this
   * one takes the full width and lets that column do the scrolling. */
  stacked?: boolean
}) {
  const { t } = useTranslation()
  const issues = mission.validation?.issues ?? []
  const pane: React.CSSProperties = {
    ...(stacked ? { width: '100%' } : { width: 320, borderLeft: `1px solid ${color.border}`, overflowY: 'auto' }),
    flexShrink: 0, background: color.surface,
    padding: space[4], display: 'flex', flexDirection: 'column', gap: space[4],
  }
  // On the pane itself, so the editor's read-only state is visible whether or
  // not a step happens to be selected.
  const mark = readOnly ? { 'data-read-only': '' } : {}

  if (!selected) {
    return (
      <div style={pane} {...mark}>
        <H>{t('missions.editor.missionChecks')}</H>
        <IssueList issues={issues} onSelectWaypoint={onSelect} />
        <p style={{ margin: 0, fontSize: font.size.sm, color: color.t3, lineHeight: 1.5 }}>{t('missions.editor.checksNote')}</p>
      </div>
    )
  }

  const wps = mission.waypoints
  const index = wps.findIndex((w) => w.waypoint_id === selected.waypoint_id)
  const prev = index > 0 ? wps[index - 1] : null
  const seg = prev ? segmentInto(mission.segments, prev, selected) ?? blankSegment(prev.waypoint_id, selected.waypoint_id) : null
  // A route's gaits, whatever the robot: never wheel_loco (routes are quad-only;
  // a wheel robot on the mission's tasks is flagged by the checks instead).
  const gaits = ROUTE_GAITS
  const unavailable = gaits.filter((g) => !ROUTE_GAITS_AVAILABLE.includes(g))
  const mine = issues.filter((i) => i.waypoint_id === selected.waypoint_id)
  const update = (patch: Partial<MissionWaypoint>) => onUpdateWaypoint(selected.waypoint_id, patch)

  // Three regions, because the middle one must stay reachable: the action
  // rows are read by opening them, and a disabled fieldset would seal them.
  const where = (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: space[2] }}>
        <span style={{ fontSize: font.size.sm, color: color.t3 }}>{t('missions.inspector.position', { n: index + 1, total: wps.length })}</span>
        <span style={{ flex: 1 }} />
        <Button size="sm" variant="ghost" icon={Trash2} onClick={() => onRemove(selected.waypoint_id)}>{t('missions.inspector.remove')}</Button>
      </div>

      <Field label={t('missions.inspector.label')}>
        <input value={selected.label} onChange={(e) => update({ label: e.target.value })} style={inputStyle} />
      </Field>

      <div style={{ display: 'grid', gap: space[2] }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: space[2] }}>
          <span style={{ fontSize: font.size.sm, color: color.t2 }}>{t('missions.inspector.coordinates')}</span>
          <EstimatedBadge compact quality="estimated" />
        </div>
        <div style={{ display: 'flex', gap: space[2], alignItems: 'center', fontSize: font.size.sm, color: color.t3 }}>
          x <NumberInput value={Number(selected.x_m.toFixed(1))} step={0.5} onChange={(v) => v !== null && update({ x_m: v })} width={84} />
          y <NumberInput value={Number(selected.y_m.toFixed(1))} step={0.5} onChange={(v) => v !== null && update({ y_m: v })} width={84} />
          m
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: space[3] }}>
        <Field label={t('missions.inspector.arriveWithin')}>
          <NumberInput value={selected.tolerance_m} min={0.1} step={0.1} onChange={(v) => update({ tolerance_m: v ?? 0.5 })} width={110} />
        </Field>
        <Field label={t('missions.inspector.face')} hint={t('missions.inspector.faceHint')}>
          <NumberInput value={selected.heading_deg} min={0} max={359} step={15} placeholder={t('missions.inspector.anyHeading')} onChange={(v) => update({ heading_deg: v })} width={110} />
        </Field>
      </div>
    </>
  )

  const actions = (
    <div style={{ display: 'grid', gap: space[2] }}>
      <H>{t('missions.inspector.actionsOnArrival')}</H>
      <WaypointActionList
        siteId={siteId}
        ownerId={ownerId}
        actions={selected.actions}
        onChange={(actions) => update({ actions })}
        readOnly={readOnly}
      />
    </div>
  )

  const leg = prev && seg
    ? (
        <div style={{ display: 'grid', gap: space[2], paddingTop: space[3], borderTop: `1px solid ${color.border}` }}>
          <H>{t('missions.inspector.legFrom', { from: prev.label })}</H>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: space[3] }}>
            <Field label={t('missions.inspector.speed')}>
              <NumberInput value={seg.speed_mps} min={0.1} max={1.5} step={0.1} placeholder={`${DEFAULT_SPEED_MPS}`} onChange={(v) => onUpdateSegment({ ...seg, speed_mps: v })} width={110} />
            </Field>
            <Field label={t('missions.inspector.gait')}>
              <select
                aria-describedby={`gait-hint-${seg.to_waypoint_id}`}
                value={seg.gait ?? ''} onChange={(e) => onUpdateSegment({ ...seg, gait: (e.target.value || null) as SegmentGait | null })}
                style={{ ...inputStyle, width: 130 }}
              >
                <option value="">{t('missions.inspector.robotDefault')}</option>
                {gaits.map((g) => {
                  // Shown but not offered until the robot can navigate in it (ROUTE_GAITS_AVAILABLE).
                  const off = !ROUTE_GAITS_AVAILABLE.includes(g)
                  return (
                    <option key={g} value={g} disabled={off} data-unavailable={off || undefined}>
                      {off ? t('missions.inspector.gaitNotYet', { gait: t(`misc.gait.${g}`) }) : t(`misc.gait.${g}`)}
                    </option>
                  )
                })}
                {/* A gait a route cannot walk in, saved before: shown, and flagged by the checks. */}
                {seg.gait && !gaits.includes(seg.gait) && <option value={seg.gait}>{t(`misc.gait.${seg.gait}`)}</option>}
              </select>
            </Field>
          </div>
          <p id={`gait-hint-${seg.to_waypoint_id}`} style={{ margin: 0, fontSize: font.size.sm, color: color.t3, lineHeight: 1.5 }}>
            {t('missions.inspector.gaitHint')}
            {unavailable.length > 0 && <> {t('missions.inspector.gaitUnavailable', { gaits: unavailable.map((g) => t(`misc.gait.${g}`)).join(', ') })}</>}
          </p>
        </div>
      )
    : null

  return (
    <div style={pane} {...mark}>
      <ReadOnlyForm on={readOnly}>{where}</ReadOnlyForm>
      {actions}
      {leg && <ReadOnlyForm on={readOnly}>{leg}</ReadOnlyForm>}
      {/* This step's own problems: reading, never editing. */}
      {mine.length > 0 && (
        <div style={{ padding: space[3], borderRadius: radius.md, background: color.card, border: `1px solid ${color.border}` }}>
          <IssueList issues={mine} />
        </div>
      )}
    </div>
  )
}
