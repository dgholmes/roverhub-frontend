import { ScanFace } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/kit'
import { useSessionStore } from '@/store/useSessionStore'
import { usePeopleArriving } from './usePeople'

/**
 * The front camera's Detections switch: draw the people the robot's perception
 * sees over the picture (perception/people, schema 0.0.38). Per viewer, off by
 * default, remembered in this browser (session store, lib/viewMemory).
 *
 * Disabled, saying why, while the robot sends no people frames: detection
 * switched off, a survey holding it off, or a bridge older than 0.0.38.
 * The span carries the tooltip because a disabled button shows none.
 */
export function DetectionsToggle({ robotId }: { robotId: string }) {
  const { t } = useTranslation()
  const on = useSessionStore((s) => s.cameraDetections)
  const setOn = useSessionStore((s) => s.setCameraDetections)
  const arriving = usePeopleArriving(robotId)
  const title = !arriving ? t('liveops.cameraTabs.detectionsNone')
    : t(on ? 'liveops.cameraTabs.detectionsOnTitle' : 'liveops.cameraTabs.detectionsOffTitle')
  return (
    <span title={title} style={{ display: 'inline-flex' }}>
      <Button
        size="sm"
        variant="ghost"
        icon={ScanFace}
        active={arriving && on}
        disabled={!arriving}
        data-testid="detections-toggle"
        onClick={() => setOn(!on)}
      >
        {t('liveops.cameraTabs.detections')}
      </Button>
    </span>
  )
}
