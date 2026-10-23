import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Camera } from 'lucide-react'
import { color, font } from '@/design-system/tokens'
import { DisabledReasonButton } from '@/components/common/DisabledReason'
import type { CameraFacing } from '@/components/liveops/feed/CameraModeTabs'
import { getCommandAvailability } from '@/liveops/commandPolicy'
import { captureActionFor } from '@/liveops/captureHotkeys'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'
import type { RobotState } from '@/types'

const FLASH_MS = 160

/**
 * Photo and Record, always on the camera picture: a semi-transparent rail on
 * the right edge of the pane, the way DJI FlightHub and Pilot place capture.
 * That edge is free in every view: the camera bar is top right, the map inset
 * bottom left, drive controls bottom centre and Quick Actions bottom right.
 *
 * Photo sends SNAPSHOT for the camera this pane shows. Record is visible but
 * disabled until recordings have a backend to land in (edge MP4 capture plus
 * the media database), so the control does not move when it arrives.
 *
 * `hotkeys` binds P (photo) for this pane. Give it to one rail per screen; in
 * Dual view that is the front pane.
 */
export function CaptureRail(
  { robot, facing, hotkeys = false }: { robot: RobotState; facing: CameraFacing; hotkeys?: boolean },
) {
  const { t } = useTranslation()
  const dispatchCommand = useLiveOpsStore((s) => s.dispatchCommand)
  const photo = getCommandAvailability(robot, 'SNAPSHOT')
  const [flash, setFlash] = useState(0)

  function takePhoto() {
    if (!photo.enabled) return
    dispatchCommand(robot.robot_id, 'SNAPSHOT', t('command.taskBar.buttons.SNAPSHOT'), { camera: facing })
    setFlash((n) => n + 1)
  }

  useEffect(() => {
    if (!flash) return
    const id = setTimeout(() => setFlash(0), FLASH_MS)
    return () => clearTimeout(id)
  }, [flash])

  useEffect(() => {
    if (!hotkeys) return
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      const action = captureActionFor({
        key: e.key, repeat: e.repeat, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey,
        targetTag: target?.tagName, targetEditable: target?.isContentEditable,
      })
      if (action === 'photo') {
        e.preventDefault()
        takePhoto()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  const photoLabel = facing === 'back' ? t('liveops.capture.photoBack') : t('liveops.capture.photoFront')

  return (
    <>
      {flash > 0 && (
        <div aria-hidden style={{
          position: 'absolute', inset: 0, zIndex: 870, pointerEvents: 'none',
          background: 'rgba(255,255,255,0.35)',
        }} />
      )}
      <div
        role="group"
        aria-label={t('liveops.capture.group')}
        style={{
          position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', zIndex: 890,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
          padding: '12px 8px', borderRadius: 32, background: 'rgba(18,18,20,0.32)',
          backdropFilter: 'blur(6px)', fontFamily: font.family,
        }}
      >
        <DisabledReasonButton
          type="button"
          enabled={photo.enabled}
          reason={photo.reason}
          onClick={takePhoto}
          aria-label={photoLabel}
          aria-keyshortcuts={hotkeys ? 'P' : undefined}
          style={{
            width: 46, height: 46, borderRadius: '50%', border: 0, padding: 0,
            display: 'grid', placeItems: 'center',
            background: photo.enabled ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.35)',
            boxShadow: '0 0 0 3px rgba(18,18,20,0.35), 0 0 0 5px rgba(255,255,255,0.5)',
            color: '#18181a',
          }}
        >
          <Camera size={20} strokeWidth={2} aria-hidden />
        </DisabledReasonButton>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', lineHeight: 1 }}>{t('liveops.capture.photo')}</span>

        <DisabledReasonButton
          type="button"
          enabled={false}
          reason={t('liveops.capture.recordUnavailable')}
          aria-label={t('liveops.capture.record')}
          style={{
            width: 46, height: 46, borderRadius: '50%', border: 0, padding: 0, marginTop: 4,
            display: 'grid', placeItems: 'center',
            background: 'rgba(18,18,20,0.5)', boxShadow: '0 0 0 2px rgba(255,255,255,0.45)',
          }}
        >
          <span aria-hidden style={{ width: 16, height: 16, borderRadius: '50%', background: color.red, opacity: 0.7 }} />
        </DisabledReasonButton>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', lineHeight: 1 }}>{t('liveops.capture.record')}</span>
      </div>
    </>
  )
}
