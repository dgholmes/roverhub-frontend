import { useTranslation } from 'react-i18next'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'
import type { RobotState } from '@/types'
import { useDetectionControl } from '@/components/liveops/command/useDetectionControl'
import { DetectionPanelBody, DetectionPanelSwitch } from '@/components/liveops/command/DetectionPanel'
import { Section } from './parts'

/**
 * Fleet › robot › Overview: AI detection (schema 0.0.31). Which detectors run
 * on this robot, each model's version and frame rate as perception last
 * reported them, and the switch. The same card opens from the chevron beside
 * LiveOps' one-click "AI" toggle; both draw DetectionPanel.
 */
export function DetectionSection({ robot }: { robot: RobotState }) {
  const { t } = useTranslation()
  const dispatchCommand = useLiveOpsStore((s) => s.dispatchCommand)
  const control = useDetectionControl(
    robot, (params, label) => dispatchCommand(robot.robot_id, 'SET_DETECTION', label, { ...params }),
  )

  return (
    <Section title={t('command.detection.title')} aside={<DetectionPanelSwitch control={control} />}>
      <DetectionPanelBody control={control} />
    </Section>
  )
}
