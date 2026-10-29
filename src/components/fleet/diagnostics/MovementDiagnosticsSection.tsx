import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { color, font, radius, space } from '@/design-system/tokens'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'
import type { RobotState } from '@/types'

const inputStyle: React.CSSProperties = {
  background: color.card, border: `1px solid ${color.border}`, borderRadius: radius.sm,
  color: color.t1, fontSize: font.size.sm, padding: '6px 10px', fontFamily: font.family,
}

const labelStyle: React.CSSProperties = {
  fontSize: font.size.xs, color: color.t3, marginBottom: 4, display: 'block',
}

const primaryButtonStyle: React.CSSProperties = {
  padding: '8px 16px', borderRadius: radius.md, background: color.accentDim,
  border: `1px solid ${color.accentBorder}`, color: color.accent,
  fontSize: font.size.sm, fontWeight: font.weight.semibold, fontFamily: font.family,
  cursor: 'pointer', alignSelf: 'flex-start',
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  )
}

/**
 * Fine-tuning motion controls for engineering testing (Fleet > robot >
 * Motion tests): numeric-input forms, distinct from LiveOps' one-tap Quick
 * Actions. Dispatched through the global useLiveOpsStore; the Motion tests tab
 * lists each command's outcome under the forms. Visible for both quad and
 * wheel robots (LINE_WALK/ROTATE/CIRCLE/SET_SPEED_RATIO/CHANGE_MODE all apply
 * to either FSM per docs/03-sdk-integration.md §7; CIRCLE resolves to the
 * `rotation` motion, which both types report).
 *
 * ⚠️ CHANGE_MODE switches LEG CONFIGURATION (parallel ⇄ X-shape) on BOTH robot
 * types -- the vendored SDK's API reference §2.5.2 marks it "Shared", and
 * describes it as "No parameters, toggles between two configurations". This
 * file previously said it switched gait on quad (walk ⇄ flying_trot) and leg
 * configuration only on wheel; that was wrong. It does NOT toggle quad ⇄
 * wheel either -- robot type is physical hardware, and `get_robot_type()`
 * exists with no setter RPC.
 *
 * The current configuration cannot be read back: GetRobotStateResponse has no
 * leg-config field. So this is a blind toggle, and its label must never imply
 * a known target.
 */
/** Renders each test as a direct child of the caller's grid (display:
 * contents), so the Motion tests tab lays movement and balance tests out as
 * one grid of tiles. Get Up isn't here: it is permanent in the robot header,
 * outside the motion-test lock. */
export function MovementDiagnosticsSection({ robot }: { robot: RobotState }) {
  const { t } = useTranslation()
  const dispatchCommand = useLiveOpsStore((s) => s.dispatchCommand)

  const [lineDirection, setLineDirection] = useState<'forward' | 'backward' | 'left' | 'right'>('forward')
  const [lineDistance, setLineDistance] = useState(1)

  const [rotateDirection, setRotateDirection] = useState<'left' | 'right'>('left')
  const [rotateAngle, setRotateAngle] = useState(90)

  const [circleDirection, setCircleDirection] = useState<'left' | 'right'>('left')
  const [circleTurns, setCircleTurns] = useState(1)

  const [speedRatio, setSpeedRatio] = useState(50)

  const [changeModeConfirmOpen, setChangeModeConfirmOpen] = useState(false)

  return (
    <div style={{ display: 'contents' }}>
      <div style={{ border: `1px solid ${color.border}`, borderRadius: radius.md, padding: space[4], display: 'flex', flexDirection: 'column', gap: space[3] }}>
        <div style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.t1 }}>{t('fleetDetail.diag.lineWalk')}</div>
        <div style={{ display: 'flex', gap: space[3] }}>
          <Field label={t('fleetDetail.diag.direction')}>
            <select value={lineDirection} onChange={(e) => setLineDirection(e.target.value as typeof lineDirection)} style={inputStyle}>
              <option value="forward">{t('fleetDetail.diag.dir.forward')}</option>
              <option value="backward">{t('fleetDetail.diag.dir.backward')}</option>
              <option value="left">{t('fleetDetail.diag.dir.left')}</option>
              <option value="right">{t('fleetDetail.diag.dir.right')}</option>
            </select>
          </Field>
          <Field label={t('fleetDetail.diag.distance')}>
            <input
              type="number" min={0} step={0.1} value={lineDistance}
              onChange={(e) => setLineDistance(Number(e.target.value))}
              style={{ ...inputStyle, width: 90 }}
            />
          </Field>
        </div>
        <button
          onClick={() => dispatchCommand(robot.robot_id, 'LINE_WALK', t('fleetDetail.diag.lineWalkLabel', { direction: t(`fleetDetail.diag.dir.${lineDirection}`) }), { direction: lineDirection, distance: lineDistance })}
          style={primaryButtonStyle}
        >
          {t('fleetDetail.diag.dispatchLineWalk')}
        </button>
      </div>

      <div style={{ border: `1px solid ${color.border}`, borderRadius: radius.md, padding: space[4], display: 'flex', flexDirection: 'column', gap: space[3] }}>
        <div style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.t1 }}>{t('fleetDetail.diag.rotate')}</div>
        <div style={{ display: 'flex', gap: space[3] }}>
          <Field label={t('fleetDetail.diag.direction')}>
            <select value={rotateDirection} onChange={(e) => setRotateDirection(e.target.value as typeof rotateDirection)} style={inputStyle}>
              <option value="left">{t('fleetDetail.diag.dir.left')}</option>
              <option value="right">{t('fleetDetail.diag.dir.right')}</option>
            </select>
          </Field>
          <Field label={t('fleetDetail.diag.angle')}>
            <input
              type="number" min={0} max={360} step={1} value={rotateAngle}
              onChange={(e) => setRotateAngle(Number(e.target.value))}
              style={{ ...inputStyle, width: 90 }}
            />
          </Field>
        </div>
        <button
          onClick={() => dispatchCommand(robot.robot_id, 'ROTATE', t('fleetDetail.diag.rotateLabel', { direction: t(`fleetDetail.diag.dir.${rotateDirection}`) }), { direction: rotateDirection, angle: rotateAngle })}
          style={primaryButtonStyle}
        >
          {t('fleetDetail.diag.dispatchRotate')}
        </button>
      </div>

      <div style={{ border: `1px solid ${color.border}`, borderRadius: radius.md, padding: space[4], display: 'flex', flexDirection: 'column', gap: space[3] }}>
        <div style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.t1 }}>{t('fleetDetail.diag.circle')}</div>
        <div style={{ display: 'flex', gap: space[3] }}>
          <Field label={t('fleetDetail.diag.direction')}>
            <select value={circleDirection} onChange={(e) => setCircleDirection(e.target.value as typeof circleDirection)} style={inputStyle}>
              <option value="left">{t('fleetDetail.diag.dir.left')}</option>
              <option value="right">{t('fleetDetail.diag.dir.right')}</option>
            </select>
          </Field>
          <Field label={t('fleetDetail.diag.turns')}>
            <input
              type="number" min={0} step={0.5} value={circleTurns}
              onChange={(e) => setCircleTurns(Number(e.target.value))}
              style={{ ...inputStyle, width: 90 }}
            />
          </Field>
        </div>
        <button
          onClick={() => dispatchCommand(robot.robot_id, 'CIRCLE', t('fleetDetail.diag.circleLabel', { direction: t(`fleetDetail.diag.dir.${circleDirection}`) }), { direction: circleDirection, turns: circleTurns })}
          style={primaryButtonStyle}
        >
          {t('fleetDetail.diag.dispatchCircle')}
        </button>
      </div>

      <div style={{ border: `1px solid ${color.border}`, borderRadius: radius.md, padding: space[4], display: 'flex', flexDirection: 'column', gap: space[3] }}>
        <div style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.t1 }}>{t('fleetDetail.diag.speedRatio')}</div>
        <Field label={t('fleetDetail.diag.ratio')}>
          <input
            type="number" min={10} max={100} step={10} value={speedRatio}
            onChange={(e) => setSpeedRatio(Number(e.target.value))}
            style={{ ...inputStyle, width: 90 }}
          />
        </Field>
        <button
          onClick={() => dispatchCommand(robot.robot_id, 'SET_SPEED_RATIO', t('fleetDetail.diag.speedRatioLabel', { ratio: speedRatio }), { ratio: speedRatio })}
          style={primaryButtonStyle}
        >
          {t('fleetDetail.diag.set')}
        </button>
      </div>

      <div style={{ border: `1px solid ${color.border}`, borderRadius: radius.md, padding: space[4], display: 'flex', flexDirection: 'column', gap: space[3] }}>
        <div style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.t1 }}>{t('fleetDetail.diag.changeMode')}</div>
        <div style={{ fontSize: font.size.xs, color: color.t3 }}>
          {t('fleetDetail.diag.changeModeBody')}
        </div>
        <button
          onClick={() => setChangeModeConfirmOpen(true)}
          style={{
            padding: '8px 16px', borderRadius: radius.md, background: color.redBg,
            border: `1px solid ${color.redBorder}`, color: color.red,
            fontSize: font.size.sm, fontWeight: font.weight.semibold, fontFamily: font.family,
            cursor: 'pointer', alignSelf: 'flex-start',
          }}
        >
          {t('fleetDetail.diag.changeModeOpen')}
        </button>
      </div>


      <Dialog open={changeModeConfirmOpen} onOpenChange={setChangeModeConfirmOpen}>
        <DialogContent style={{ background: color.elevated, border: `1px solid ${color.border}`, color: color.t1 }}>
          <DialogHeader>
            <DialogTitle style={{ color: color.red }}>{t('fleetDetail.diag.confirmChangeMode')}</DialogTitle>
            <DialogDescription style={{ color: color.t2 }}>
              {t('fleetDetail.diag.confirmChangeModeBody', { name: robot.name })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              onClick={() => {
                dispatchCommand(robot.robot_id, 'CHANGE_MODE', t('fleetDetail.diag.changeMode'))
                setChangeModeConfirmOpen(false)
              }}
              style={{
                padding: '8px 16px', borderRadius: radius.md, background: color.red, border: 'none',
                color: '#fff', fontWeight: font.weight.bold, cursor: 'pointer', fontFamily: font.family,
              }}
            >
              {t('fleetDetail.diag.confirmChangeMode')}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
