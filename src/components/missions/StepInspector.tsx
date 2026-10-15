import { useTranslation } from 'react-i18next'
import { Trash2 } from 'lucide-react'
import { color, font, radius, space } from '@/design-system/tokens'
import { Button } from '@/components/kit'
import { EstimatedBadge } from '@/components/common/EstimatedBadge'
import { capabilitiesFor } from '@/lib/robotCapabilities'
import { DEFAULT_SPEED_MPS, segmentInto } from '@/missions/estimates'
import type { GaitMode, MissionLibraryEntry, MissionWaypoint, RobotType, Segment } from '@/types'
import { Field, IssueList, NumberInput, inputStyle } from './parts'
import { TaskList } from './TaskList'

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
export function StepInspector({ siteId, mission, selected, robotType, onUpdateWaypoint, onUpdateSegment, onRemove, onSelect }: {
  siteId: string
  mission: MissionLibraryEntry
  selected: MissionWaypoint | null
  robotType: RobotType | null
  onUpdateWaypoint: (id: string, patch: Partial<MissionWaypoint>) => void
  onUpdateSegment: (seg: Segment) => void
  onRemove: (id: string) => void
  onSelect: (id: string) => void
}) {
  const { t } = useTranslation()
  const issues = mission.validation?.issues ?? []
  const pane: React.CSSProperties = {
    width: 320, flexShrink: 0, borderLeft: `1px solid ${color.border}`, background: color.surface,
    padding: space[4], display: 'flex', flexDirection: 'column', gap: space[4], overflowY: 'auto',
  }

  if (!selected) {
    return (
      <div style={pane}>
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
  const gaits: GaitMode[] = robotType ? capabilitiesFor(robotType).velocityGaits : ['walk', 'flying_trot', 'wheel_loco']
  const mine = issues.filter((i) => i.waypoint_id === selected.waypoint_id)
  const update = (patch: Partial<MissionWaypoint>) => onUpdateWaypoint(selected.waypoint_id, patch)

  return (
    <div style={pane}>
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

      <div style={{ display: 'grid', gap: space[2] }}>
        <H>{t('missions.inspector.actionsOnArrival')}</H>
        <TaskList
          siteId={siteId}
          ownerId={mission.robot_id ?? `site-${siteId}`}
          actions={selected.actions}
          onChange={(actions) => update({ actions })}
        />
      </div>

      {prev && seg && (
        <div style={{ display: 'grid', gap: space[2], paddingTop: space[3], borderTop: `1px solid ${color.border}` }}>
          <H>{t('missions.inspector.legFrom', { from: prev.label })}</H>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: space[3] }}>
            <Field label={t('missions.inspector.speed')}>
              <NumberInput value={seg.speed_mps} min={0.1} max={1.5} step={0.1} placeholder={`${DEFAULT_SPEED_MPS}`} onChange={(v) => onUpdateSegment({ ...seg, speed_mps: v })} width={110} />
            </Field>
            <Field label={t('missions.inspector.gait')}>
              <select
                value={seg.gait ?? ''} onChange={(e) => onUpdateSegment({ ...seg, gait: (e.target.value || null) as GaitMode | null })}
                style={{ ...inputStyle, width: 130 }}
              >
                <option value="">{t('missions.inspector.robotDefault')}</option>
                {gaits.map((g) => <option key={g} value={g}>{t(`misc.gait.${g}`)}</option>)}
              </select>
            </Field>
          </div>
        </div>
      )}

      {mine.length > 0 && (
        <div style={{ padding: space[3], borderRadius: radius.md, background: color.card, border: `1px solid ${color.border}` }}>
          <IssueList issues={mine} />
        </div>
      )}
    </div>
  )
}
