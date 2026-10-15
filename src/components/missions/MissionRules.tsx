import { useTranslation } from 'react-i18next'
import { color, font, space } from '@/design-system/tokens'
import { Segmented } from '@/components/kit'
import { Section, SectionGrid } from '@/components/fleet/v2/parts'
import { robotTypeLabel } from '@/lib/robotCapabilities'
import { formatStart, parseStart, todayIn } from '@/missions/schedule'
import {
  DEFAULT_CONSTRAINTS, DEFAULT_DISPATCH_RULE, DEFAULT_RECORDING,
  type AreaType, type GroundConstraints, type HumanProximityPolicy, type MissionLibraryEntry, type MissionType,
  type RobotState, type ScheduleRecurrence, type SurfaceType,
} from '@/types'
import { Check, Field, IssueList, NumberInput, inputStyle } from './parts'
import { hhmm, weekdayNames } from './scheduleText'

const TYPES: MissionType[] = ['patrol', 'inspection', 'escort', 'return_to_dock', 'emergency']
const AREAS: AreaType[] = ['indoor', 'outdoor']
const SURFACES: SurfaceType[] = ['unknown', 'hard', 'carpet', 'gravel', 'grass']
const PROXIMITY: HumanProximityPolicy[] = ['none', 'slow', 'pause', 'alert', 'require_takeover']

/**
 * Rules tab: who runs the mission, when, what must be true before it starts
 * (dispatch rules) and what the ground allows (ground rules). Defaults are
 * the cautious ones from the schema.
 */
export function MissionRules({ mission, robots, timezone, onChange }: {
  mission: MissionLibraryEntry
  robots: RobotState[]
  timezone: string
  onChange: (patch: Partial<MissionLibraryEntry>) => void
}) {
  const { t } = useTranslation()
  const c = mission.constraints ?? DEFAULT_CONSTRAINTS
  const d = mission.dispatch_rule ?? DEFAULT_DISPATCH_RULE
  const s = mission.schedule ?? null
  const rec = mission.recording ?? DEFAULT_RECORDING
  const start = s ? parseStart(s.start_at) : null
  const setC = (patch: Partial<GroundConstraints>) => onChange({ constraints: { ...c, ...patch } })
  const setD = (patch: Partial<typeof d>) => onChange({ dispatch_rule: { ...d, ...patch } })
  const setS = (patch: Partial<NonNullable<typeof s>>) => s && onChange({ schedule: { ...s, ...patch } })
  const days = weekdayNames()
  const scheduleIssues = (mission.validation?.issues ?? []).filter((i) => i.code === 'scheduleNoRobot' || i.code === 'weeklyNoDays' || i.code === 'stairsOnWheel')

  const recordingIssues = (mission.validation?.issues ?? []).filter((i) => i.code === 'videoWithoutRecording' || i.code === 'videoCameraNotRecorded' || i.code === 'recordingNoCameras')

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: `${space[5]}px ${space[6]}px` }}>
      <SectionGrid>
        <Section title={t('missions.rules.mission')}>
          <div style={{ display: 'grid', gap: space[3] }}>
            <Field label={t('missions.rules.type')}>
              <select value={mission.type} onChange={(e) => onChange({ type: e.target.value as MissionType })} style={inputStyle}>
                {TYPES.map((x) => <option key={x} value={x}>{t(`command.taskBar.missionType.${x}`)}</option>)}
              </select>
            </Field>
            <Field label={t('missions.rules.robot')} hint={t('missions.rules.robotHint')}>
              <select value={mission.robot_id ?? ''} onChange={(e) => onChange({ robot_id: e.target.value || undefined })} style={inputStyle}>
                <option value="">{t('missions.library.anyRobot')}</option>
                {robots.map((r) => <option key={r.robot_id} value={r.robot_id}>{`${r.name} · ${robotTypeLabel(r.robot_type)}`}</option>)}
              </select>
            </Field>
          </div>
        </Section>

        <Section title={t('missions.rules.schedule')}>
          <div style={{ display: 'grid', gap: space[3] }}>
            <Check
              label={t('missions.rules.runOnSchedule')} checked={s !== null}
              onChange={(on) => onChange({
                schedule: on
                  ? { schedule_id: `sch-${mission.mission_id}`, recurrence: 'weekly', start_at: formatStart(todayIn(timezone), 6 * 60), timezone, days_of_week: [0, 1, 2, 3, 4], window_minutes: null }
                  : null,
                library_status: on ? 'scheduled' : mission.library_status === 'scheduled' ? 'draft' : mission.library_status,
              })}
            />
            {s && start && (
              <>
                <Segmented<ScheduleRecurrence>
                  label={t('missions.rules.repeats')} value={s.recurrence} onChange={(recurrence) => setS({ recurrence })}
                  options={(['once', 'daily', 'weekly'] as const).map((r) => ({ value: r, label: t(`missions.schedule.${r}`) }))}
                />
                <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap' }}>
                  <Field label={s.recurrence === 'once' ? t('missions.rules.date') : t('missions.rules.from')}>
                    <input type="date" value={start.date} onChange={(e) => e.target.value && setS({ start_at: formatStart(e.target.value, start.minutes) })} style={inputStyle} />
                  </Field>
                  <Field label={t('missions.rules.time')}>
                    <input
                      type="time" value={hhmm(start.minutes)}
                      onChange={(e) => { const [h, m] = e.target.value.split(':').map(Number); if (!Number.isNaN(h)) setS({ start_at: formatStart(start.date, h * 60 + (m || 0)) }) }}
                      style={inputStyle}
                    />
                  </Field>
                </div>
                {s.recurrence === 'weekly' && (
                  <div role="group" aria-label={t('missions.rules.days')} style={{ display: 'flex', gap: space[1], flexWrap: 'wrap' }}>
                    {days.map((name, i) => {
                      const on = s.days_of_week.includes(i)
                      return (
                        <button
                          key={i} type="button" aria-pressed={on}
                          onClick={() => setS({ days_of_week: on ? s.days_of_week.filter((x) => x !== i) : [...s.days_of_week, i].sort() })}
                          className={on ? 'rh-btn rh-btn--sm rh-btn--active' : 'rh-btn rh-btn--sm'}
                        >{name}</button>
                      )
                    })}
                  </div>
                )}
                <span style={{ fontSize: font.size.sm, color: color.t3 }}>{t('missions.rules.timezone', { tz: s.timezone })}</span>
              </>
            )}
            {scheduleIssues.length > 0 && <IssueList issues={scheduleIssues} />}
          </div>
        </Section>

        <Section title={t('missions.rules.recording')}>
          <div style={{ display: 'grid', gap: space[3] }}>
            <Check label={t('missions.rules.recordRun')} checked={rec.enabled} onChange={(enabled) => onChange({ recording: { ...rec, enabled } })} />
            {rec.enabled && (['front', 'rear'] as const).map((cam) => (
              <Check key={cam} label={t(`missions.task.${cam}`)} checked={rec.cameras.includes(cam)}
                onChange={(on) => onChange({ recording: { ...rec, cameras: on ? [...rec.cameras, cam] : rec.cameras.filter((c) => c !== cam) } })} />
            ))}
            <span style={{ fontSize: font.size.sm, color: color.t3, lineHeight: 1.5 }}>{t('missions.rules.recordingHint')}</span>
            {recordingIssues.length > 0 && <IssueList issues={recordingIssues} />}
          </div>
        </Section>

        <Section title={t('missions.rules.dispatch')}>
          <div style={{ display: 'grid', gap: space[3] }}>
            <Field label={t('missions.rules.minBattery')} hint={t('missions.rules.minBatteryHint')}>
              <NumberInput value={d.min_battery_pct} min={0} max={100} step={5} placeholder="—" onChange={(v) => setD({ min_battery_pct: v })} />
            </Field>
            <Check label={t('missions.rules.requireNetwork')} checked={d.require_network} onChange={(v) => setD({ require_network: v })} />
            <Check label={t('missions.rules.requireApproval')} checked={d.require_approval} onChange={(v) => setD({ require_approval: v })} />
            <Check label={t('missions.rules.blockMaintenance')} checked={d.block_if_maintenance_flagged} onChange={(v) => setD({ block_if_maintenance_flagged: v })} />
            <Check label={t('missions.rules.requireChecklist')} checked={d.require_safety_checklist} onChange={(v) => setD({ require_safety_checklist: v })} />
            <Field label={t('missions.rules.maxWind')}>
              <NumberInput value={d.max_wind_kph} min={0} step={5} placeholder="—" onChange={(v) => setD({ max_wind_kph: v })} />
            </Field>
          </div>
        </Section>

        <Section title={t('missions.rules.ground')}>
          <div style={{ display: 'grid', gap: space[3] }}>
            <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap' }}>
              <Field label={t('missions.rules.area')}>
                <select value={c.area_type} onChange={(e) => setC({ area_type: e.target.value as AreaType })} style={inputStyle}>
                  {AREAS.map((x) => <option key={x} value={x}>{t(`missions.rules.areaType.${x}`)}</option>)}
                </select>
              </Field>
              <Field label={t('missions.rules.surface')}>
                <select value={c.surface_type} onChange={(e) => setC({ surface_type: e.target.value as SurfaceType })} style={inputStyle}>
                  {SURFACES.map((x) => <option key={x} value={x}>{t(`missions.rules.surfaceType.${x}`)}</option>)}
                </select>
              </Field>
            </div>
            <Check label={t('missions.rules.stairs')} checked={c.stairs_allowed} onChange={(v) => setC({ stairs_allowed: v })} />
            <Field label={t('missions.rules.clearance')} hint={t('missions.rules.clearanceHint')}>
              <NumberInput value={c.min_clearance_m} min={0} step={0.5} placeholder="1" onChange={(v) => setC({ min_clearance_m: v })} />
            </Field>
            <Field label={t('missions.rules.people')}>
              <select value={c.human_proximity_policy} onChange={(e) => setC({ human_proximity_policy: e.target.value as HumanProximityPolicy })} style={inputStyle}>
                {PROXIMITY.map((x) => <option key={x} value={x}>{t(`missions.rules.proximity.${x}`)}</option>)}
              </select>
            </Field>
          </div>
        </Section>
      </SectionGrid>
      <p style={{ marginTop: space[6], fontSize: font.size.sm, color: color.t3, maxWidth: 640, lineHeight: 1.5 }}>{t('missions.rules.note')}</p>
    </div>
  )
}
