import { useTranslation } from 'react-i18next'
import { color, font, space } from '@/design-system/tokens'
import { useSessionStore } from '@/store/useSessionStore'
import { usePeopleArriving } from '@/components/liveops/hero/usePeople'
import { DetectionSwitch } from './DetectionSwitch'

/**
 * "Show boxes on the camera" in the LiveOps AI card (2026-11-27: the operator
 * looks for it where AI detection is switched on). The same per-viewer setting
 * as the camera's Detections button (session store `cameraDetections`), so
 * either one turns the overlay on and both show it. Disabled while the robot
 * sends no people frames.
 */
export function ShowDetectionsRow({ robotId }: { robotId: string }) {
  const { t } = useTranslation()
  const on = useSessionStore((s) => s.cameraDetections)
  const setOn = useSessionStore((s) => s.setCameraDetections)
  const arriving = usePeopleArriving(robotId)
  const label = t('liveops.cameraTabs.showOnCamera')
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: space[2], marginTop: space[3] }}>
      <span style={{ flex: 1, fontSize: font.size.sm, color: arriving ? color.t1 : color.t3 }}>{label}</span>
      <DetectionSwitch
        on={arriving && on}
        enabled={arriving}
        reason={t('liveops.cameraTabs.detectionsNone')}
        label={label}
        onChange={setOn}
      />
    </div>
  )
}
