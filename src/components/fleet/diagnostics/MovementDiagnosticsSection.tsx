import { useState } from 'react'
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
 * Fine-tuning motion controls for engineering testing — numeric-input-driven
 * forms, distinct from LiveOps' one-tap Quick Actions canned motions
 * (CurrentTaskBar/QuickActionsMenu). Same self-contained, no-toast pattern as
 * CalibrationSection.tsx: dispatched via the global useLiveOpsStore, but this
 * Fleet drawer has no toast renderer, so the operator confirms success by
 * watching the robot rather than a CommandAckToast. Visible for both quad and
 * wheel robots (LINE_WALK/ROTATE/CIRCLE/SET_SPEED_RATIO/CHANGE_MODE all apply
 * to either FSM per docs/03-sdk-integration.md §7).
 */
export function MovementDiagnosticsSection({ robot }: { robot: RobotState }) {
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
      <div style={{ border: `1px solid ${color.border}`, borderRadius: radius.md, padding: space[4], display: 'flex', flexDirection: 'column', gap: space[3] }}>
        <div style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.t1 }}>Line Walk</div>
        <div style={{ display: 'flex', gap: space[3] }}>
          <Field label="Direction">
            <select value={lineDirection} onChange={(e) => setLineDirection(e.target.value as typeof lineDirection)} style={inputStyle}>
              <option value="forward">Forward</option>
              <option value="backward">Backward</option>
              <option value="left">Left</option>
              <option value="right">Right</option>
            </select>
          </Field>
          <Field label="Distance (m)">
            <input
              type="number" min={0} step={0.1} value={lineDistance}
              onChange={(e) => setLineDistance(Number(e.target.value))}
              style={{ ...inputStyle, width: 90 }}
            />
          </Field>
        </div>
        <button
          onClick={() => dispatchCommand(robot.robot_id, 'LINE_WALK', `Line Walk ${lineDirection}`, { direction: lineDirection, distance: lineDistance })}
          style={primaryButtonStyle}
        >
          Dispatch Line Walk
        </button>
      </div>

      <div style={{ border: `1px solid ${color.border}`, borderRadius: radius.md, padding: space[4], display: 'flex', flexDirection: 'column', gap: space[3] }}>
        <div style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.t1 }}>Rotate</div>
        <div style={{ display: 'flex', gap: space[3] }}>
          <Field label="Direction">
            <select value={rotateDirection} onChange={(e) => setRotateDirection(e.target.value as typeof rotateDirection)} style={inputStyle}>
              <option value="left">Left</option>
              <option value="right">Right</option>
            </select>
          </Field>
          <Field label="Angle (°)">
            <input
              type="number" min={0} max={360} step={1} value={rotateAngle}
              onChange={(e) => setRotateAngle(Number(e.target.value))}
              style={{ ...inputStyle, width: 90 }}
            />
          </Field>
        </div>
        <button
          onClick={() => dispatchCommand(robot.robot_id, 'ROTATE', `Rotate ${rotateDirection}`, { direction: rotateDirection, angle: rotateAngle })}
          style={primaryButtonStyle}
        >
          Dispatch Rotate
        </button>
      </div>

      <div style={{ border: `1px solid ${color.border}`, borderRadius: radius.md, padding: space[4], display: 'flex', flexDirection: 'column', gap: space[3] }}>
        <div style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.t1 }}>Circle</div>
        <div style={{ display: 'flex', gap: space[3] }}>
          <Field label="Direction">
            <select value={circleDirection} onChange={(e) => setCircleDirection(e.target.value as typeof circleDirection)} style={inputStyle}>
              <option value="left">Left</option>
              <option value="right">Right</option>
            </select>
          </Field>
          <Field label="Turns">
            <input
              type="number" min={0} step={0.5} value={circleTurns}
              onChange={(e) => setCircleTurns(Number(e.target.value))}
              style={{ ...inputStyle, width: 90 }}
            />
          </Field>
        </div>
        <button
          onClick={() => dispatchCommand(robot.robot_id, 'CIRCLE', `Circle ${circleDirection}`, { direction: circleDirection, turns: circleTurns })}
          style={primaryButtonStyle}
        >
          Dispatch Circle
        </button>
      </div>

      <div style={{ border: `1px solid ${color.border}`, borderRadius: radius.md, padding: space[4], display: 'flex', flexDirection: 'column', gap: space[3] }}>
        <div style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.t1 }}>Speed Ratio</div>
        <Field label="Ratio (0–100)">
          <input
            type="number" min={0} max={100} step={1} value={speedRatio}
            onChange={(e) => setSpeedRatio(Number(e.target.value))}
            style={{ ...inputStyle, width: 90 }}
          />
        </Field>
        <button
          onClick={() => dispatchCommand(robot.robot_id, 'SET_SPEED_RATIO', `Set Speed Ratio ${speedRatio}`, { ratio: speedRatio })}
          style={primaryButtonStyle}
        >
          Set
        </button>
      </div>

      <div style={{ border: `1px solid ${color.border}`, borderRadius: radius.md, padding: space[4], display: 'flex', flexDirection: 'column', gap: space[3] }}>
        <div style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.t1 }}>Change Mode</div>
        <div style={{ fontSize: font.size.xs, color: color.t3 }}>
          Toggles the robot between quad and wheel mode. Consequential and physically disruptive — confirm before
          dispatching.
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
          Change Mode…
        </button>
      </div>

      <Dialog open={changeModeConfirmOpen} onOpenChange={setChangeModeConfirmOpen}>
        <DialogContent style={{ background: color.elevated, border: `1px solid ${color.border}`, color: color.t1 }}>
          <DialogHeader>
            <DialogTitle style={{ color: color.red }}>Confirm Change Mode</DialogTitle>
            <DialogDescription style={{ color: color.t2 }}>
              This toggles {robot.name} between quad and wheel mode on the robot itself. Only confirm if the robot is
              in a safe, stationary posture for the transition.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              onClick={() => {
                dispatchCommand(robot.robot_id, 'CHANGE_MODE', 'Change Mode')
                setChangeModeConfirmOpen(false)
              }}
              style={{
                padding: '8px 16px', borderRadius: radius.md, background: color.red, border: 'none',
                color: '#fff', fontWeight: font.weight.bold, cursor: 'pointer', fontFamily: font.family,
              }}
            >
              Confirm Change Mode
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
