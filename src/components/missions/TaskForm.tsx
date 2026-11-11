import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, Play, Save, Trash2 } from 'lucide-react'
import { color, font, radius, space } from '@/design-system/tokens'
import { Badge, Button, IconButton, Segmented } from '@/components/kit'
import { Section, SectionGrid } from '@/components/fleet/v2/parts'
import { formatStart, parseStart } from '@/missions/schedule'
import { hhmm, weekdayNames } from '@/missions/scheduleText'
import {
  dispatchRuleViews, removeAction, resolveConflict, ruleBadgeKey, saveState, savedMission, taskConflict, taskIsDirty, taskIssues,
  type RuleView,
} from '@/missions/taskPanel'
import { ROUTE_RUN_BLOCKS, TIMINGS, formActions, runNowBlock, timingOf, withMissionIssue, withTiming, type Timing } from '@/missions/taskRun'
import { useSiteMapFor } from '@/missions/useMissionMap'
import { runTaskNowAndOpen } from '@/missions/runTaskNowAndOpen'
import { useTaskStore } from '@/missions/useTaskStore'
import type { DispatchRule, MissionLibraryEntry, MissionTask, RobotState, TaskStatus } from '@/types'
import { Check, Field, IssueList, NumberInput, inputStyle } from './parts'
import { RobotPicker, useRobotAvailability } from './RobotPicker'
import { RoutePreviewMap } from './RoutePreviewMap'
import { ProgramPreview } from './visual-program/ProgramPreview'

type Tx = (key: string, options?: Record<string, unknown>) => string

/**
 * One task, new or saved: the mission's map, and beside it the form -- the mission first, then the robot,
 * when it runs, what must hold before it starts, and its running-time cap.
 * Laid out in the same grid as the mission's Settings. A task saves on its own
 * (PUT /tasks/{id}); what may be saved is decided in missions/taskPanel.ts and
 * missions/taskRun.ts, where it is tested.
 */
export function TaskForm({ siteId, initial, isNew, missions, robots, timezone, onDone }: {
  siteId: string
  initial: MissionTask
  isNew: boolean
  missions: MissionLibraryEntry[]
  robots: RobotState[]
  timezone: string
  /** Back to the list: after a save, a removal, or leaving. */
  onDone: () => void
}) {
  const { t } = useTranslation()
  const tx = t as unknown as Tx
  const save = useTaskStore((s) => s.save)
  const remove = useTaskStore((s) => s.remove)
  const availability = useRobotAvailability(robots)
  const [baseline, setBaseline] = useState<MissionTask | null>(isNew ? null : initial)
  const [draft, setDraft] = useState<MissionTask>(initial)
  const [saving, setSaving] = useState(false)
  const [starting, setStarting] = useState(false)
  const [refusal, setRefusal] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [stale, setStale] = useState<MissionTask | null>(null)
  const [confirm, setConfirm] = useState<'leave' | 'remove' | null>(null)

  const patch = (p: Partial<MissionTask>) => setDraft((d) => ({ ...d, ...p }))
  const mission = missions.find((m) => m.mission_id === draft.mission_id)
  const rule = draft.dispatch_rule
  // The mission here is the stored one, which is what the scheduler reads.
  const issues = withMissionIssue(
    mission ? taskIssues(draft, { draft: mission, saved: savedMission(mission), robotStatus: draft.robot_id ? availability.get(draft.robot_id)?.status ?? null : null }) : [],
    mission, t('missions.tasks.issue.noMission'),
  )
  const dirty = taskIsDirty(draft, baseline)
  const sstate = saveState({ dirty, saving, issues, stale: stale !== null })
  // A route runs only on the site's active map, and only on a quad.
  const { map: siteMap } = useSiteMapFor(siteId)
  const runCtx = { siteMap: siteMap ?? null, robotType: robots.find((r) => r.robot_id === draft.robot_id)?.robot_type ?? null }
  const { saveAndRun } = formActions(draft, mission, runCtx)
  const runOff = mission ? runNowBlock(draft, mission, runCtx) : null
  const timing = timingOf(draft)
  const s = draft.schedule
  const start = s ? parseStart(s.start_at) : null
  const setS = (p: Partial<NonNullable<typeof s>>) => s && patch({ schedule: { ...s, ...p } })
  const sorted = [...missions].sort((a, b) => a.name.localeCompare(b.name))
  // A new task is unsaved from the start; it is worth asking about once it has a mission.
  const losesWork = baseline === null ? Boolean(mission) : dirty

  async function doSave(andRun: boolean) {
    setSaving(true)
    setError(null)
    try {
      const stored = await save(draft)
      setBaseline(stored)
      setDraft(stored)
      setStale(null)
      if (andRun) {
        const m = missions.find((x) => x.mission_id === stored.mission_id)
        if (m) await run(stored, m)
      } else onDone()
    } catch (e) {
      const c = taskConflict(e)
      if (c?.kind === 'stale') setStale(c.stored)
      else setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }
  async function run(task: MissionTask, m: MissionLibraryEntry) {
    setStarting(true)
    setRefusal(null)
    try {
      const result = await runTaskNowAndOpen(siteId, task, m)
      if (!result.ok) setRefusal(result.reason)
    } finally {
      setStarting(false)
    }
  }
  async function doRemove() {
    setError(null)
    try {
      if (baseline) await remove(baseline.task_id)
      onDone()
    } catch (e) {
      setConfirm(null)
      setError(tx('missions.tasks.removeFailed', { error: e instanceof Error ? e.message : String(e) }))
    }
  }

  // "Save and run now" asks for both, so it needs something to save, or a saved
  // task with nothing changed, which it simply runs.
  const runDisabled = !saveAndRun || saving || starting || stale !== null || (dirty && sstate.disabled)

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0 }}>
      <div style={{
        flexShrink: 0, background: color.surface, borderBottom: `1px solid ${color.border}`,
        display: 'flex', alignItems: 'center', gap: space[3], padding: `${space[2]}px ${space[4]}px`, flexWrap: 'wrap',
      }}>
        <Button size="sm" variant="ghost" icon={ChevronLeft} onClick={() => (losesWork ? setConfirm('leave') : onDone())}>
          {t('missions.tasks.form.back')}
        </Button>
        <input
          value={draft.name ?? ''} onChange={(e) => patch({ name: e.target.value === '' ? null : e.target.value })}
          placeholder={mission?.name ?? t(isNew ? 'missions.tasks.form.newTitle' : 'missions.tasks.form.editTitle')}
          aria-label={t('missions.tasks.form.name')}
          style={{
            background: 'transparent', border: '1px solid transparent', borderRadius: radius.sm, padding: '4px 6px',
            color: color.t1, fontSize: font.size.lg, fontWeight: font.weight.bold, fontFamily: font.family, minWidth: 160, width: 280,
          }}
          onFocus={(ev) => { ev.target.style.borderColor = color.border }}
          onBlur={(ev) => { ev.target.style.borderColor = 'transparent' }}
        />
        {baseline === null && <Badge tone="amber">{t('missions.tasks.notSavedYet')}</Badge>}
        <span style={{ flex: 1 }} />
        <Segmented<TaskStatus>
          label={t('missions.tasks.status')} value={draft.status === 'paused' ? 'paused' : 'enabled'} onChange={(status) => patch({ status })}
          options={(['enabled', 'paused'] as const).map((v) => ({ value: v, label: t(`missions.tasks.statusOption.${v}`) }))}
        />
        {!isNew && <IconButton icon={Trash2} label={t('missions.tasks.remove')} onClick={() => (removeAction(baseline) === 'confirm' ? setConfirm('remove') : onDone())} />}
        <Button size="sm" icon={Save} disabled={sstate.disabled} onClick={() => void doSave(false)}>{t(`missions.tasks.${sstate.label}`)}</Button>
        <Button
          size="sm" variant="primary" icon={Play} disabled={runDisabled}
          title={runOff ? t(`missions.tasks.runNowOff.${runOff}`) : undefined}
          onClick={() => (dirty ? void doSave(true) : mission && void run(draft, mission))}
        >
          {starting ? t('missions.tasks.start.starting') : dirty ? t('missions.tasks.form.saveAndRun') : t('missions.tasks.runNow')}
        </Button>
      </div>

      {(confirm || error || stale || refusal) && (
        <div role="alert" style={{
          display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap', padding: `${space[2]}px ${space[4]}px`,
          background: confirm === 'remove' || error || refusal ? color.redBg : color.amberBg, fontSize: font.size.md, color: color.t1,
        }}>
          {confirm === 'leave' && <>
            <span>{t('missions.tasks.form.unsaved')}</span>
            <Button size="sm" variant="danger" onClick={onDone}>{t('missions.editor.discard')}</Button>
            <Button size="sm" onClick={() => setConfirm(null)}>{t('missions.editor.keepEditing')}</Button>
          </>}
          {confirm === 'remove' && <>
            <span>{t('missions.tasks.confirmRemove')}</span>
            <Button size="sm" variant="danger" onClick={() => void doRemove()}>{t('missions.tasks.remove')}</Button>
            <Button size="sm" onClick={() => setConfirm(null)}>{t('missions.tasks.cancel')}</Button>
          </>}
          {!confirm && stale && <>
            <span>{t('missions.tasks.conflict.stale', { version: stale.version })}</span>
            <Button size="sm" onClick={() => { setDraft(resolveConflict(draft, stale, 'theirs')); setBaseline(stale); setStale(null) }}>{t('missions.tasks.conflict.useSaved')}</Button>
            <Button size="sm" onClick={() => { setDraft(resolveConflict(draft, stale, 'mine')); setBaseline(stale); setStale(null) }}>{t('missions.tasks.conflict.keepMine')}</Button>
          </>}
          {!confirm && !stale && !error && refusal && <>
            <span>{refusal}</span>
            <Button size="sm" onClick={() => setRefusal(null)}>{t('missions.editor.dismiss')}</Button>
          </>}
          {!confirm && !stale && error && <>
            <span>{t('missions.tasks.saveFailed', { error })}</span>
            <Button size="sm" onClick={() => setError(null)}>{t('missions.editor.dismiss')}</Button>
          </>}
        </div>
      )}

      {/* The mission's route (or a program's blocks) fills the page and the form sits beside it as a
          panel (FlightHub 2's Create Plan), so choosing a mission shows where
          it goes. The grid drops to one column at this width. */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
      <div style={{ flex: 1, position: 'relative', minWidth: 0, background: color.mapBg }}>
        {mission?.kind === 'program' ? (
          <ProgramPreview state={mission.program_state} />
        ) : mission && (
          <RoutePreviewMap
            missionId={mission.mission_id} waypoints={mission.waypoints}
            padding={{ topLeft: [32, 32], bottomRight: [32, 32] }}
          />
        )}
      </div>
      <div style={{ width: 460, flexShrink: 0, overflowY: 'auto', background: color.surface, padding: `${space[5]}px ${space[5]}px` }}>
        <SectionGrid>
          <Section title={t('missions.tasks.form.mission')}>
            <div style={{ display: 'grid', gap: space[2] }}>
              <select
                value={draft.mission_id} aria-label={t('missions.tasks.form.mission')} style={inputStyle}
                // A saved task keeps its mission: its runs and history belong to it.
                disabled={!isNew}
                onChange={(e) => patch({ mission_id: e.target.value })}
              >
                <option value="" disabled>{t('missions.tasks.form.pickMission')}</option>
                {/* A saved task whose mission was deleted still shows what it points at. */}
                {!mission && draft.mission_id && <option value={draft.mission_id}>{t('missions.calendar.unknownMission')}</option>}
                {sorted.map((m) => <option key={m.mission_id} value={m.mission_id}>{m.name} · {t(`missions.tasks.form.kind.${m.kind}`)}</option>)}
              </select>
              {mission?.kind === 'route' && runOff && ROUTE_RUN_BLOCKS.includes(runOff) && (
                <span style={{ display: 'flex', alignItems: 'center', gap: space[2], fontSize: font.size.sm, color: color.t2 }}>
                  <Badge tone="amber">{t('missions.cantRun')}</Badge>{t(`missions.tasks.runNowOff.${runOff}`)}
                </span>
              )}
            </div>
          </Section>

          {mission && <>
            <Section title={t('missions.tasks.robot')}>
              <RobotPicker
                robots={robots} value={draft.robot_id ?? undefined} onChange={(id) => patch({ robot_id: id ?? null })}
                noneLabel={t('missions.tasks.noRobot')} noneHint={t('missions.tasks.noRobotHint')}
              />
            </Section>

            <Section title={t('missions.tasks.form.when')}>
              <div style={{ display: 'grid', gap: space[3] }}>
                <Segmented<Timing>
                  label={t('missions.tasks.form.when')} value={timing} onChange={(v) => setDraft((d) => withTiming(d, v, timezone, new Date()))}
                  options={TIMINGS.map((v) => ({ value: v, label: t(`missions.tasks.form.timing.${v}`) }))}
                />
                {s && start && <>
                  <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap' }}>
                    <Field label={s.recurrence === 'once' ? t('missions.tasks.date') : t('missions.tasks.from')}>
                      <input type="date" value={start.date} onChange={(e) => e.target.value && setS({ start_at: formatStart(e.target.value, start.minutes) })} style={inputStyle} />
                    </Field>
                    <Field label={t('missions.tasks.time')}>
                      <input
                        type="time" value={hhmm(start.minutes)}
                        onChange={(e) => { const [h, m] = e.target.value.split(':').map(Number); if (!Number.isNaN(h)) setS({ start_at: formatStart(start.date, h * 60 + (m || 0)) }) }}
                        style={inputStyle}
                      />
                    </Field>
                  </div>
                  {s.recurrence === 'weekly' && (
                    <div role="group" aria-label={t('missions.tasks.days')} style={{ display: 'flex', gap: space[1], flexWrap: 'wrap' }}>
                      {weekdayNames().map((name, i) => {
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
                  <span style={{ fontSize: font.size.sm, color: color.t3 }}>{t('missions.tasks.timezone', { tz: s.timezone })}</span>
                </>}
                <span style={{ fontSize: font.size.sm, color: color.t3, lineHeight: 1.4 }}>
                  {timing === 'now' ? t('missions.tasks.form.nowHint') : t('missions.tasks.form.scheduledHint')}
                </span>
              </div>
            </Section>

            <Section title={t('missions.tasks.beforeStart')}>
              {/* Only rules that do something today stay open. The rest -- each
                  disabled and marked as not enforced -- fold into one line that
                  still names them, so the form is about what can be set. */}
              <div style={{ display: 'grid', gap: space[3] }}>
                {dispatchRuleViews(rule).filter((v) => v.editable).map((view) => (
                  <RuleRow key={view.key} view={view} rule={rule} tx={tx} onChange={(p) => patch({ dispatch_rule: { ...rule, ...p } })} />
                ))}
                {(() => {
                  const later = dispatchRuleViews(rule).filter((v) => !v.editable)
                  if (later.length === 0) return null
                  return (
                    <details style={{ background: color.card, borderRadius: radius.md, padding: `${space[2]}px ${space[3]}px` }}>
                      <summary style={{ cursor: 'pointer', fontSize: font.size.sm, color: color.t2 }}>
                        {t('missions.tasks.rule.laterSummary', { names: later.map((v) => tx(`missions.tasks.rule.laterShort.${v.key}`)).join(', ') })}
                      </summary>
                      <div style={{ display: 'grid', gap: space[3], marginTop: space[3] }}>
                        {later.map((view) => (
                          <RuleRow key={view.key} view={view} rule={rule} tx={tx} onChange={(p) => patch({ dispatch_rule: { ...rule, ...p } })} />
                        ))}
                      </div>
                    </details>
                  )
                })()}
              </div>
            </Section>

            <Section title={t('missions.tasks.form.runningTime')}>
              <div style={{ display: 'grid', gap: space[2] }}>
                <Field label={t('missions.tasks.maxDuration')}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: space[2] }}>
                    <NumberInput value={draft.max_duration_min} min={1} step={1} placeholder="—" onChange={(v) => patch({ max_duration_min: v })} />
                    <Badge title={t('missions.tasks.maxDurationHint')}>{t('missions.tasks.maxDurationBadge')}</Badge>
                  </span>
                </Field>
                <span style={{ fontSize: font.size.sm, color: color.t3, lineHeight: 1.4 }}>{t('missions.tasks.form.maxDurationShort')}</span>
              </div>
            </Section>
          </>}

          {/* Until a mission is picked, the hint below says what to do; an error would repeat it. */}
          {mission && issues.length > 0 && (
            <Section title={t('missions.tasks.form.checks')} span>
              <IssueList issues={issues} />
            </Section>
          )}
        </SectionGrid>
        {!mission && !draft.mission_id && (
          <p style={{ margin: `${space[6]}px 0 0`, fontSize: font.size.md, color: color.t3 }}>{t('missions.tasks.form.pickFirst')}</p>
        )}
      </div>
      </div>
    </div>
  )
}

/**
 * One dispatch rule: its control, a badge saying what it does today, and one
 * short line why. The full reason is on the badge's tooltip (docs/05-ui-ux.md
 * §18.4: abbreviate, never omit). A rule nothing enforces is disabled, so a
 * checked box cannot promise a gate that is not there.
 */
function RuleRow({ view, rule, tx, onChange }: {
  view: RuleView
  rule: DispatchRule
  tx: Tx
  onChange: (patch: Partial<DispatchRule>) => void
}) {
  const short = <span style={{ fontSize: font.size.xs, color: color.t3, lineHeight: 1.4 }}>{tx(`missions.tasks.rule.short.${view.key}`)}</span>
  const badge = <Badge tone={view.key === 'min_battery_pct' ? 'amber' : 'neutral'} title={tx(view.reasonKey)}>{tx(ruleBadgeKey(view))}</Badge>

  if (view.key === 'min_battery_pct') {
    return (
      <div style={{ display: 'grid', gap: space[1] }}>
        <Field label={tx('missions.tasks.rule.minBattery')}>
          <span style={{ display: 'flex', alignItems: 'center', gap: space[2] }}>
            <NumberInput value={rule.min_battery_pct} min={0} max={100} step={5} placeholder="—" onChange={(v) => onChange({ min_battery_pct: v })} />
            {badge}
          </span>
        </Field>
        {short}
        {view.warningKey && <span role="alert" style={{ fontSize: font.size.sm, color: color.amber, lineHeight: 1.4 }}>{tx(view.warningKey)}</span>}
      </div>
    )
  }

  const label = tx(`missions.tasks.rule.label.${view.key}`)
  const value = rule[view.key]
  return (
    <div style={{ display: 'grid', gap: space[1] }}>
      {typeof value === 'boolean' ? (
        <span style={{ display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
          <Check label={label} checked={value} disabled={!view.editable} onChange={(v) => onChange({ [view.key]: v })} />
          {badge}
        </span>
      ) : (
        <Field label={label}>
          <span style={{ display: 'flex', alignItems: 'center', gap: space[2] }}>
            <NumberInput value={value} disabled={!view.editable} placeholder="—" onChange={(v) => onChange({ [view.key]: v })} />
            {badge}
          </span>
        </Field>
      )}
      {short}
    </div>
  )
}
