import { Play } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ActionButton } from '@/components/liveops/mission/ActionButton'
import { getCommandAvailability, resumeRoleBlock } from '@/liveops/commandPolicy'
import type { RobotRunView } from '@/liveops/robotRun'
import { useEngineerTools, useSiteRole } from '@/org/useCan'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'
import type { CommandAvailability, RobotState } from '@/types'

/**
 * RESUME {run_id}, for a run the robot paused as blocked ("Retry") or an
 * E-Stop paused ("Resume", schema 0.0.33). One command, worded as what it does
 * for this pause (`TaskBarModel.retryAs`). Both shells draw it from their
 * `retry` deck entry.
 *
 * Who may press it mirrors the backend (commandPolicy `resumeCapability`): any
 * operator who may drive resumes an E-Stop pause, a supervisor retries a
 * blocked route. The role's refusal comes first, since nothing else the
 * operator does would change it.
 */
export function ResumeButton({ robot, run, as = 'retry' }: {
  robot: RobotState
  run: RobotRunView
  as?: 'retry' | 'resume'
}) {
  const { t } = useTranslation()
  const dispatchCommand = useLiveOpsStore((s) => s.dispatchCommand)
  const role = useSiteRole()
  const engineerTools = useEngineerTools()
  if (!run) return null
  const roleBlock = resumeRoleBlock(role, engineerTools, run)
  const availability: CommandAvailability = roleBlock
    ? { enabled: false, reason: roleBlock }
    : getCommandAvailability(robot, 'RESUME', run)
  const resume = as === 'resume'
  return (
    <ActionButton
      icon={Play}
      tone="blue"
      label={t(resume ? 'command.taskBar.run.resume' : 'command.taskBar.run.retry')}
      availability={availability}
      onClick={() => dispatchCommand(
        robot.robot_id, 'RESUME',
        t(resume ? 'command.taskBar.run.resumeCommand' : 'command.taskBar.run.retryCommand'),
        { run_id: run.runId },
      )}
    />
  )
}
