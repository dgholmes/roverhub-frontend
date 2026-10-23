import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus } from 'lucide-react'
import { color, font, radius, space } from '@/design-system/tokens'
import { Badge, Button, Segmented } from '@/components/kit'
import { dataProvider } from '@/lib/realtime/dataProvider'
import { formatStart, parseStart } from '@/missions/schedule'
import { hhmm, weekdayNames } from '@/missions/scheduleText'
import {
  canSaveTask, capEstimateNote, defaultSchedule, dispatchRuleViews, newTask, resolveConflict, runNowNotice, taskConflict, taskIsDirty, taskIssues,
  taskScheduleLine, tasksOf, type Notice, type RuleView,
} from '@/missions/taskPanel'
import { useMissionStore } from '@/missions/useMissionStore'
import { useTaskStore } from '@/missions/useTaskStore'
import { useSessionStore } from '@/store/useSessionStore'
import type { DispatchRule, MissionLibraryEntry, MissionTask, RobotState, ScheduleRecurrence, TaskStatus } from '@/types'
import { Check, Field, IssueList, NumberInput, inputStyle } from './parts'
import { RobotPicker, useRobotAvailability } from './RobotPicker'

type Tx = (key: string, options?: Record<string, unknown>) => string

/**
 * Tasks tab: the mission's tasks, one card each. A task is this mission given
 * to a robot, on a schedule, with its own rules for starting; the server
 * schedules them. Each task saves on its own (PUT /tasks/{id}), separately
 * from the mission, because that is how the backend stores them.
 *
 * What to show and whether a task may be saved is decided in
 * `missions/taskPanel.ts`, where it is tested; this file only draws it.
 */
export function MissionTasksPanel({ siteId, mission, isNew, robots, timezone }: {
  siteId: string
  mission: MissionLibraryEntry
  /** The mission has not been saved: a task would point at nothing. */
  isNew: boolean
  robots: RobotState[]
  timezone: string
}) {
  const { t } = useTranslation()
  const tasks = useTaskStore((s) => s.tasks)
  const tasksLoaded = useTaskStore((s) => s.tasksLoaded)
  const error = useTaskStore((s) => s.error)
  const operator = useSessionStore((s) => s.operatorName)
  // The scheduler reads the *saved* mission's estimate, so the checks do too.
  const stored = useMissionStore((s) => s.missions.find((m) => m.mission_id === mission.mission_id) ?? null)
  const estimateNote = capEstimateNote(mission, stored)
  // Tasks made here and not yet saved. Once saved they are in the store.
  const [added, setAdded] = useState<MissionTask[]>([])

  const saved = tasksOf(tasks, mission.mission_id)
  const drafts = added.filter((a) => !saved.some((s) => s.task_id === a.task_id))
  const all = [...saved.map((task) => ({ task, isSaved: true })), ...drafts.map((task) => ({ task, isSaved: false }))]

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: `${space[5]}px ${space[6]}px`, display: 'grid', gap: space[4], alignContent: 'start', maxWidth: 820 }}>
      <p style={{ margin: 0, fontSize: font.size.md, color: color.t2, lineHeight: 1.5 }}>{t('missions.tasks.intro')}</p>
      {isNew ? (
        <p role="note" style={{ margin: 0, padding: `${space[2]}px ${space[4]}px`, borderRadius: radius.md, background: color.amberBg, fontSize: font.size.md, color: color.t1 }}>
          {t('missions.tasks.saveMissionFirst')}
        </p>
      ) : !tasksLoaded ? (
        error
          ? <p role="alert" style={{ margin: 0, fontSize: font.size.md, color: color.red }}>{t('missions.tasks.loadFailed', { error })}</p>
          : <p style={{ margin: 0, fontSize: font.size.md, color: color.t3 }}>{t('missions.tasks.loading')}</p>
      ) : (
        <>
          {estimateNote && (
            <p role="note" style={{ margin: 0, padding: `${space[2]}px ${space[4]}px`, borderRadius: radius.md, background: color.amberBg, fontSize: font.size.md, color: color.t1 }}>
              {(t as unknown as Tx)(estimateNote)}
            </p>
          )}
          {all.length === 0 && <p style={{ margin: 0, fontSize: font.size.md, color: color.t3 }}>{t('missions.tasks.empty')}</p>}
          {all.map(({ task, isSaved }, i) => (
            <TaskCard
              key={task.task_id} n={i + 1} initial={task} isSaved={isSaved} mission={mission} stored={stored} robots={robots} timezone={timezone}
              onGone={() => setAdded((a) => a.filter((x) => x.task_id !== task.task_id))}
            />
          ))}
          <div>
            <Button size="sm" icon={Plus} onClick={() => setAdded((a) => [...a, newTask({ mission, siteId, timezone, creator: operator, now: new Date() })])}>
              {t('missions.tasks.add')}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

function TaskCard({ n, initial, isSaved, mission, stored, robots, timezone, onGone }: {
  n: number
  initial: MissionTask
  isSaved: boolean
  mission: MissionLibraryEntry
  /** The mission as saved; the duration cap is checked against it. */
  stored: MissionLibraryEntry | null
  robots: RobotState[]
  timezone: string
  /** The task no longer exists to show: a draft discarded, or a saved task removed. */
  onGone: () => void
}) {
  const { t } = useTranslation()
  const tx = t as unknown as Tx
  const save = useTaskStore((s) => s.save)
  const remove = useTaskStore((s) => s.remove)
  const availability = useRobotAvailability(robots)
  const [baseline, setBaseline] = useState<MissionTask | null>(isSaved ? initial : null)
  const [draft, setDraft] = useState<MissionTask>(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stale, setStale] = useState<MissionTask | null>(null)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)

  const patch = (p: Partial<MissionTask>) => setDraft((d) => ({ ...d, ...p }))
  const rule = draft.dispatch_rule
  const issues = taskIssues(draft, { mission, stored, robotStatus: draft.robot_id ? availability.get(draft.robot_id)?.status ?? null : null })
  const dirty = taskIsDirty(draft, baseline)
  const s = draft.schedule
  const start = s ? parseStart(s.start_at) : null
  const setS = (p: Partial<NonNullable<typeof s>>) => s && patch({ schedule: { ...s, ...p } })

  async function doSave() {
    setSaving(true)
    setError(null)
    try {
      const stored = await save(draft)
      setBaseline(stored)
      setDraft(stored)
      setStale(null)
    } catch (e) {
      const c = taskConflict(e)
      if (c?.kind === 'stale') setStale(c.stored)
      else setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }
  async function doRemove() {
    setError(null)
    try {
      if (baseline) await remove(baseline.task_id)
      onGone()
    } catch (e) {
      setError(tx('missions.tasks.removeFailed', { error: e instanceof Error ? e.message : String(e) }))
    }
  }
  async function doRunNow() {
    setNotice(null)
    try {
      setNotice(runNowNotice({ occurrence: await dataProvider.runTaskNow(draft.task_id) }))
    } catch (e) {
      setNotice(runNowNotice({ error: e }))
    }
  }

  return (
    <section style={{ display: 'grid', gap: space[4], padding: space[4], borderRadius: radius.md, background: color.card }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: font.size.md, fontWeight: font.weight.bold, color: color.t1 }}>{t('missions.tasks.heading', { n })}</h3>
        <span style={{ fontSize: font.size.sm, color: color.t2 }}>{taskScheduleLine(draft)}</span>
        {baseline === null && <Badge tone="amber">{t('missions.tasks.notSavedYet')}</Badge>}
        <span style={{ flex: 1 }} />
        <Segmented<TaskStatus>
          label={t('missions.tasks.status')} value={draft.status === 'paused' ? 'paused' : 'enabled'} onChange={(status) => patch({ status })}
          options={(['enabled', 'paused'] as const).map((v) => ({ value: v, label: t(`missions.tasks.statusOption.${v}`) }))}
        />
      </header>

      <div style={{ display: 'grid', gap: space[1], minWidth: 0 }}>
        <span style={{ fontSize: font.size.sm, color: color.t2 }}>{t('missions.tasks.robot')}</span>
        <RobotPicker
          robots={robots} value={draft.robot_id ?? undefined} onChange={(id) => patch({ robot_id: id ?? null })}
          noneLabel={t('missions.tasks.noRobot')} noneHint={t('missions.tasks.noRobotHint')}
        />
      </div>

      <div style={{ display: 'grid', gap: space[3] }}>
        <Check
          label={t('missions.tasks.runOnSchedule')} checked={s !== null}
          onChange={(on) => patch({ schedule: on ? defaultSchedule(draft.task_id, timezone, new Date()) : null })}
        />
        {s && start && (
          <>
            <Segmented<ScheduleRecurrence>
              label={t('missions.tasks.repeats')} value={s.recurrence} onChange={(recurrence) => setS({ recurrence })}
              options={(['once', 'daily', 'weekly'] as const).map((r) => ({ value: r, label: t(`missions.schedule.${r}`) }))}
            />
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
          </>
        )}
      </div>

      <Field label={t('missions.tasks.maxDuration')} hint={t('missions.tasks.maxDurationHint')}>
        <NumberInput value={draft.max_duration_min} min={1} step={1} placeholder="—" onChange={(v) => patch({ max_duration_min: v })} />
      </Field>

      <div style={{ display: 'grid', gap: space[3] }}>
        <span style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.t2 }}>{t('missions.tasks.beforeStart')}</span>
        {dispatchRuleViews(rule).map((view) => (
          <RuleRow key={view.key} view={view} rule={rule} tx={tx} onChange={(p) => patch({ dispatch_rule: { ...rule, ...p } })} />
        ))}
      </div>

      <IssueList issues={issues} hideWhenEmpty />

      {stale && (
        <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap', padding: `${space[2]}px ${space[4]}px`, borderRadius: radius.md, background: color.amberBg, fontSize: font.size.md, color: color.t1 }}>
          <span>{t('missions.tasks.conflict.stale', { version: stale.version })}</span>
          <Button size="sm" onClick={() => { setDraft(resolveConflict(draft, stale, 'theirs')); setBaseline(stale); setStale(null) }}>{t('missions.tasks.conflict.useSaved')}</Button>
          <Button size="sm" onClick={() => { setDraft(resolveConflict(draft, stale, 'mine')); setBaseline(stale); setStale(null) }}>{t('missions.tasks.conflict.keepMine')}</Button>
        </div>
      )}
      {error && <p role="alert" style={{ margin: 0, fontSize: font.size.sm, color: color.red }}>{t('missions.tasks.saveFailed', { error })}</p>}
      {notice && <p role="status" style={{ margin: 0, fontSize: font.size.sm, color: notice.tone === 'error' ? color.red : color.t2 }}>{tx(notice.key, notice.params)}</p>}

      <footer style={{ display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
        <Button size="sm" variant="primary" disabled={!dirty || saving || !canSaveTask(issues) || stale !== null} onClick={doSave}>
          {saving ? t('missions.tasks.saving') : dirty ? t('missions.tasks.save') : t('missions.tasks.saved')}
        </Button>
        {baseline && !dirty && draft.status === 'enabled' && <Button size="sm" onClick={doRunNow}>{t('missions.tasks.runNow')}</Button>}
        <span style={{ flex: 1 }} />
        {confirmRemove ? (
          <>
            <span style={{ fontSize: font.size.sm, color: color.t1 }}>{t('missions.tasks.confirmRemove')}</span>
            <Button size="sm" variant="danger" onClick={doRemove}>{t('missions.tasks.remove')}</Button>
            <Button size="sm" onClick={() => setConfirmRemove(false)}>{t('missions.tasks.cancel')}</Button>
          </>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => (baseline ? setConfirmRemove(true) : onGone())}>{t('missions.tasks.remove')}</Button>
        )}
      </footer>
    </section>
  )
}

/**
 * One dispatch rule. A rule nothing enforces is shown disabled, with the
 * stored value and its own reason, and a badge saying so: a checked box that
 * looked live would promise a gate that is not there (the EstimatedBadge
 * precedent). The battery minimum is editable because the scheduler does read
 * it; what it lacks is a reading, and the note says exactly that.
 */
function RuleRow({ view, rule, tx, onChange }: {
  view: RuleView
  rule: DispatchRule
  tx: Tx
  onChange: (patch: Partial<DispatchRule>) => void
}) {
  const note: React.CSSProperties = { fontSize: font.size.xs, color: color.t3, lineHeight: 1.4 }

  if (view.key === 'min_battery_pct') {
    return (
      <div style={{ display: 'grid', gap: space[1] }}>
        <Field label={tx('missions.tasks.rule.minBattery')} hint={tx('missions.tasks.rule.minBatteryHint')}>
          <span style={{ display: 'flex', alignItems: 'center', gap: space[2] }}>
            <NumberInput value={rule.min_battery_pct} min={0} max={100} step={5} placeholder="—" onChange={(v) => onChange({ min_battery_pct: v })} />
            <Badge tone="amber">{tx('missions.tasks.rule.noReading')}</Badge>
          </span>
        </Field>
        <span style={note}>{tx(view.reasonKey)}</span>
        {view.warningKey && <span role="alert" style={{ fontSize: font.size.sm, color: color.amber, lineHeight: 1.4 }}>{tx(view.warningKey)}</span>}
      </div>
    )
  }

  const label = tx(`missions.tasks.rule.label.${view.key}`)
  const value = rule[view.key]
  return (
    <div style={{ display: 'grid', gap: space[1] }}>
      {typeof value === 'boolean' ? (
        <span style={{ display: 'flex', alignItems: 'center', gap: space[2] }}>
          <Check label={label} checked={value} disabled={!view.editable} onChange={(v) => onChange({ [view.key]: v })} />
          <Badge>{tx('missions.tasks.rule.notEnforced')}</Badge>
        </span>
      ) : (
        <Field label={label}>
          <span style={{ display: 'flex', alignItems: 'center', gap: space[2] }}>
            <NumberInput value={value} disabled={!view.editable} placeholder="—" onChange={(v) => onChange({ [view.key]: v })} />
            <Badge>{tx('missions.tasks.rule.notEnforced')}</Badge>
          </span>
        </Field>
      )}
      <span style={note}>{tx(view.reasonKey)}</span>
    </div>
  )
}
