import { useTranslation } from 'react-i18next'
import { color, font, space } from '@/design-system/tokens'
import { Section, SectionGrid } from '@/components/fleet/v2/parts'
import {
  DEFAULT_CONSTRAINTS, DEFAULT_RECORDING,
  type AreaType, type GroundConstraints, type HumanProximityPolicy, type MissionLibraryEntry, type MissionType, type SurfaceType,
} from '@/types'
import { Check, Field, IssueList, NumberInput, inputStyle } from './parts'

const TYPES: MissionType[] = ['patrol', 'inspection', 'escort', 'return_to_dock', 'emergency']
const AREAS: AreaType[] = ['indoor', 'outdoor']
const SURFACES: SurfaceType[] = ['unknown', 'hard', 'carpet', 'gravel', 'grass']
const PROXIMITY: HumanProximityPolicy[] = ['none', 'slow', 'pause', 'alert', 'require_takeover']

/**
 * Settings tab: what belongs to the mission itself -- its type, whole-run
 * recording and what the ground allows. Who runs it, when, and what must be
 * true before it starts are a task's (MissionTasksPanel). Defaults are the
 * cautious ones from the schema.
 */
export function MissionRules({ mission, onChange }: {
  mission: MissionLibraryEntry
  onChange: (patch: Partial<MissionLibraryEntry>) => void
}) {
  const { t } = useTranslation()
  const c = mission.constraints ?? DEFAULT_CONSTRAINTS
  const rec = mission.recording ?? DEFAULT_RECORDING
  const setC = (patch: Partial<GroundConstraints>) => onChange({ constraints: { ...c, ...patch } })
  const groundIssues = (mission.validation?.issues ?? []).filter((i) => i.code === 'stairsOnWheel')
  const recordingIssues = (mission.validation?.issues ?? []).filter((i) => i.code === 'videoWithoutRecording' || i.code === 'videoCameraNotRecorded' || i.code === 'recordingNoCameras')

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: `${space[5]}px ${space[6]}px` }}>
      <SectionGrid>
        <Section title={t('missions.rules.mission')}>
          <div style={{ display: 'grid', gap: space[3], gridTemplateColumns: 'minmax(0, 1fr)' }}>
            <Field label={t('missions.rules.type')}>
              <select value={mission.type} onChange={(e) => onChange({ type: e.target.value as MissionType })} style={inputStyle}>
                {TYPES.map((x) => <option key={x} value={x}>{t(`command.taskBar.missionType.${x}`)}</option>)}
              </select>
            </Field>
          </div>
        </Section>

        <Section title={t('missions.rules.recording')}>
          <div style={{ display: 'grid', gap: space[3] }}>
            <Check label={t('missions.rules.recordRun')} checked={rec.enabled} onChange={(enabled) => onChange({ recording: { ...rec, enabled } })} />
            {rec.enabled && (['front', 'rear'] as const).map((cam) => (
              <Check key={cam} label={t(`missions.actions.${cam}`)} checked={rec.cameras.includes(cam)}
                onChange={(on) => onChange({ recording: { ...rec, cameras: on ? [...rec.cameras, cam] : rec.cameras.filter((c) => c !== cam) } })} />
            ))}
            <span style={{ fontSize: font.size.sm, color: color.t3, lineHeight: 1.5 }}>{t('missions.rules.recordingHint')}</span>
            {recordingIssues.length > 0 && <IssueList issues={recordingIssues} />}
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
            {groundIssues.length > 0 && <IssueList issues={groundIssues} />}
          </div>
        </Section>
      </SectionGrid>
      <p style={{ marginTop: space[6], fontSize: font.size.sm, color: color.t3, maxWidth: 640, lineHeight: 1.5 }}>{t('missions.rules.note')}</p>
    </div>
  )
}
