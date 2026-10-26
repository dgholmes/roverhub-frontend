import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ExternalLink } from 'lucide-react'
import { color, font, radius, space } from '@/design-system/tokens'
import { Badge, Button } from '@/components/kit'
import { Section, SectionGrid } from '@/components/fleet/v2/parts'
import { useProgramRun, type ProgramEditorHandle } from '@/missions/program/useProgramRun'
import type { Step } from '@/missions/program/types'
import { autoRunStep, type AutoRunPhase } from '@/missions/taskRun'
import type { MissionLibraryEntry, MissionTask, RobotState } from '@/types'
import { formatDuration } from './parts'
import { availabilityText, useRobotAvailability } from './RobotPicker'
import { ProgramRunBar } from './program/ProgramRunBar'
import { RunLog } from './program/RunLog'
import { savedProgramBlocks } from './visual-program/savedProgram'

/**
 * A task's Run now: its mission's saved program, run from this browser on the
 * task's robot, like the editor's Program tab but without the canvas. Opening
 * it starts the run: control is taken first if this console does not hold it
 * (the robot stands up), then the program starts. Anything else in the way
 * stops it there, and the run bar says why. E-Stop is in the bar throughout.
 */
export function TaskRunPage({ siteId, task, title, mission, robots, onBack, onOpenMission }: {
  siteId: string
  task: MissionTask
  title: string
  mission: MissionLibraryEntry
  robots: RobotState[]
  onBack: () => void
  onOpenMission: () => void
}) {
  const { t } = useTranslation()
  const blocks = useMemo(() => savedProgramBlocks(mission.program_state), [mission.program_state])
  const [active, setActive] = useState<string | null>(null)
  // Stands in for the canvas: the saved program, and a highlight that marks the step list.
  const handle = useRef<ProgramEditorHandle>({ programBlocks: () => blocks ?? [], detachedCount: () => 0, highlight: setActive })
  handle.current = { programBlocks: () => blocks ?? [], detachedCount: () => 0, highlight: setActive }
  const robotId = task.robot_id ?? undefined
  const run = useProgramRun({
    mission, robots, robotId, blocks: blocks ?? [], missionIssues: mission.validation?.issues ?? [], editorRef: handle,
  })
  const availability = useRobotAvailability(robots)
  const robot = robots.find((r) => r.robot_id === robotId)

  // Run now: one click for the whole start. A ref, not state, so React's
  // development double-run of effects cannot take control or start twice.
  const phase = useRef<AutoRunPhase>(blocks === null ? 'done' : 'idle')
  const blockerKey = run.blockers.join(',')
  useEffect(() => {
    const step = autoRunStep(phase.current, {
      blockers: run.blockers, takingControl: run.takingControl, takeFailed: run.takeFailure !== null, running: run.state !== 'idle',
    })
    phase.current = step.next
    if (step.action === 'take') void run.takeControl(t('missions.program.run.takeControlCommand'))
    if (step.action === 'start') void run.start()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockerKey, run.takingControl, run.takeFailure, run.state])

  const [leaving, setLeaving] = useState(false)
  const back = () => (run.state === 'idle' ? onBack() : setLeaving(true))

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0 }}>
      <div style={{
        flexShrink: 0, background: color.surface, borderBottom: `1px solid ${color.border}`,
        display: 'flex', alignItems: 'center', gap: space[3], padding: `${space[2]}px ${space[4]}px`, flexWrap: 'wrap',
      }}>
        <Button size="sm" variant="ghost" icon={ChevronLeft} onClick={back}>{t('missions.tasks.form.back')}</Button>
        <span style={{ fontSize: font.size.lg, fontWeight: font.weight.bold, color: color.t1 }}>{title}</span>
        <span style={{ fontSize: font.size.sm, color: color.t2 }}>{t('missions.tasks.run.subtitle')}</span>
        <span style={{ flex: 1 }} />
        <Button size="sm" variant="ghost" icon={ExternalLink} onClick={onOpenMission}>{t('missions.tasks.run.openMission')}</Button>
      </div>

      {leaving && (
        <div role="alert" style={{
          display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap', padding: `${space[2]}px ${space[4]}px`,
          background: color.amberBg, fontSize: font.size.md, color: color.t1,
        }}>
          <span>{t('missions.program.run.leave.body')}</span>
          <Button size="sm" variant="danger" onClick={() => { run.abortNow(); onBack() }}>{t('missions.program.run.leave.confirm')}</Button>
          <Button size="sm" onClick={() => setLeaving(false)}>{t('missions.program.run.leave.cancel')}</Button>
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: `${space[5]}px ${space[6]}px` }}>
          {blocks === null ? (
            <p role="alert" style={{ margin: 0, padding: `${space[2]}px ${space[4]}px`, borderRadius: radius.md, background: color.redBg, fontSize: font.size.md, color: color.t1 }}>
              {t('missions.tasks.run.unreadable')}
            </p>
          ) : (
            <SectionGrid>
              <Section title={t('missions.tasks.run.mission')}>
                <div style={{ display: 'grid', gap: space[1], fontSize: font.size.md }}>
                  <span style={{ color: color.t1, fontWeight: font.weight.semibold }}>{mission.name}</span>
                  <span style={{ color: color.t2, fontVariantNumeric: 'tabular-nums' }}>
                    {t('missions.tasks.run.estimate', { duration: formatDuration(mission.estimates?.duration_s) })}
                    {mission.estimates && !mission.estimates.duration_bounded && ` · ${t('missions.editor.mayRunLonger')}`}
                  </span>
                </div>
              </Section>
              <Section title={t('missions.tasks.run.robot')}>
                <div style={{ display: 'grid', gap: space[1], fontSize: font.size.md }}>
                  <span style={{ color: color.t1, fontWeight: font.weight.semibold }}>{robot?.name ?? robotId}</span>
                  {robotId && availability.get(robotId) && <span style={{ color: color.t2 }}>{availabilityText(availability.get(robotId)!, t)}</span>}
                </div>
              </Section>
              <Section title={t('missions.tasks.run.steps')} span>
                {run.steps.length === 0
                  ? <span style={{ fontSize: font.size.md, color: color.t3 }}>{t('missions.tasks.run.noSteps')}</span>
                  : <StepTree steps={run.steps} active={active} />}
              </Section>
            </SectionGrid>
          )}
        </div>
        <RunLog run={run} siteId={siteId} detached={0} />
      </div>
      <ProgramRunBar run={run} robots={robots} robotId={robotId} onRobot={() => {}} fixedRobot />
    </div>
  )
}

/** The program's steps as an indented list; the one running is tinted. */
function StepTree({ steps, active }: { steps: Step[]; active: string | null }) {
  const { t } = useTranslation()
  return (
    <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 2 }}>
      {steps.map((s) => {
        const on = s.blockId === active
        const children = s.kind === 'repeat' || s.kind === 'repeatUntil' ? [s.body]
          : s.kind === 'if' ? [s.then, s.else] : []
        return (
          <li key={s.blockId}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: space[2], padding: `${space[1]}px ${space[2]}px`, borderRadius: radius.sm,
              background: on ? color.accentDim : 'transparent', fontSize: font.size.md, color: on ? color.t1 : color.t2,
            }}>
              <span>{s.label}</span>
              {on && <Badge tone="accent">{t('missions.tasks.run.now')}</Badge>}
            </div>
            {children.filter((c) => c.length > 0).map((c, i) => (
              <div key={i} style={{ paddingLeft: space[5] }}><StepTree steps={c} active={active} /></div>
            ))}
          </li>
        )
      })}
    </ol>
  )
}
