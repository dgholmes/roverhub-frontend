import { useState } from 'react'
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

interface PoseValues {
  duration: number
  roll_deg: number
  pitch_deg: number
  yaw_deg: number
  height_m: number
}

const DEFAULT_POSE: PoseValues = { duration: 1, roll_deg: 0, pitch_deg: 0, yaw_deg: 0, height_m: 0 }

/**
 * Quad-only balance/pose fine-tuning — entirely absent (not disabled) for
 * wheel robots since none of BALANCE_AXIS/BALANCE_NEUTRAL/DYNAMIC_POSE/
 * STATIC_POSE exist in the wheel-mode FSM, matching the hide-not-disable
 * precedent already established by QuickActionsMenu.tsx for quad-only
 * controls. Same self-contained, no-toast dispatch pattern as
 * CalibrationSection.tsx / MovementDiagnosticsSection.tsx.
 */
export function BalanceDiagnosticsSection({ robot }: { robot: RobotState }) {
  const dispatchCommand = useLiveOpsStore((s) => s.dispatchCommand)

  const [axis, setAxis] = useState<'pitch' | 'yaw' | 'roll' | 'height'>('pitch')
  const [axisValue, setAxisValue] = useState(0)
  const [axisDuration, setAxisDuration] = useState(1)
  const [axisMode, setAxisMode] = useState<'dynamic' | 'static'>('dynamic')

  const [pose, setPose] = useState<PoseValues>(DEFAULT_POSE)

  function updatePose<K extends keyof PoseValues>(key: K, value: number) {
    setPose((p) => ({ ...p, [key]: value }))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
      <div style={{ border: `1px solid ${color.border}`, borderRadius: radius.md, padding: space[4], display: 'flex', flexDirection: 'column', gap: space[3] }}>
        <div style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.t1 }}>Balance Axis</div>
        <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap' }}>
          <Field label="Axis">
            <select value={axis} onChange={(e) => setAxis(e.target.value as typeof axis)} style={inputStyle}>
              <option value="pitch">Pitch</option>
              <option value="yaw">Yaw</option>
              <option value="roll">Roll</option>
              <option value="height">Height</option>
            </select>
          </Field>
          <Field label="Value">
            <input
              type="number" step={0.1} value={axisValue}
              onChange={(e) => setAxisValue(Number(e.target.value))}
              style={{ ...inputStyle, width: 90 }}
            />
          </Field>
          <Field label="Duration (s)">
            <input
              type="number" min={0} step={0.1} value={axisDuration}
              onChange={(e) => setAxisDuration(Number(e.target.value))}
              style={{ ...inputStyle, width: 90 }}
            />
          </Field>
          <Field label="Mode">
            <select value={axisMode} onChange={(e) => setAxisMode(e.target.value as typeof axisMode)} style={inputStyle}>
              <option value="dynamic">Dynamic</option>
              <option value="static">Static</option>
            </select>
          </Field>
        </div>
        <button
          onClick={() => dispatchCommand(robot.robot_id, 'BALANCE_AXIS', `Balance ${axis}`, {
            axis, value: axisValue, duration: axisDuration, mode: axisMode,
          })}
          style={primaryButtonStyle}
        >
          Dispatch Balance Axis
        </button>
      </div>

      <div style={{ border: `1px solid ${color.border}`, borderRadius: radius.md, padding: space[4], display: 'flex', flexDirection: 'column', gap: space[3] }}>
        <div style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.t1 }}>Balance Neutral</div>
        <div style={{ fontSize: font.size.xs, color: color.t3 }}>Resets the robot's balance to its neutral posture.</div>
        <button
          onClick={() => dispatchCommand(robot.robot_id, 'BALANCE_NEUTRAL', 'Balance Neutral')}
          style={primaryButtonStyle}
        >
          Reset to Neutral
        </button>
      </div>

      <div style={{ border: `1px solid ${color.border}`, borderRadius: radius.md, padding: space[4], display: 'flex', flexDirection: 'column', gap: space[3] }}>
        <div style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.t1 }}>Pose</div>
        <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap' }}>
          <Field label="Duration (s)">
            <input
              type="number" min={0} step={0.1} value={pose.duration}
              onChange={(e) => updatePose('duration', Number(e.target.value))}
              style={{ ...inputStyle, width: 80 }}
            />
          </Field>
          <Field label="Roll (°)">
            <input
              type="number" step={1} value={pose.roll_deg}
              onChange={(e) => updatePose('roll_deg', Number(e.target.value))}
              style={{ ...inputStyle, width: 80 }}
            />
          </Field>
          <Field label="Pitch (°)">
            <input
              type="number" step={1} value={pose.pitch_deg}
              onChange={(e) => updatePose('pitch_deg', Number(e.target.value))}
              style={{ ...inputStyle, width: 80 }}
            />
          </Field>
          <Field label="Yaw (°)">
            <input
              type="number" step={1} value={pose.yaw_deg}
              onChange={(e) => updatePose('yaw_deg', Number(e.target.value))}
              style={{ ...inputStyle, width: 80 }}
            />
          </Field>
          <Field label="Height (m)">
            <input
              type="number" step={0.01} value={pose.height_m}
              onChange={(e) => updatePose('height_m', Number(e.target.value))}
              style={{ ...inputStyle, width: 80 }}
            />
          </Field>
        </div>
        <div style={{ display: 'flex', gap: space[2] }}>
          <button
            onClick={() => dispatchCommand(robot.robot_id, 'DYNAMIC_POSE', 'Dynamic Pose', { ...pose })}
            style={primaryButtonStyle}
          >
            Apply Dynamic
          </button>
          <button
            onClick={() => dispatchCommand(robot.robot_id, 'STATIC_POSE', 'Static Pose', { ...pose })}
            style={{
              padding: '8px 16px', borderRadius: radius.md, background: 'transparent',
              border: `1px solid ${color.border}`, color: color.t2,
              fontSize: font.size.sm, fontWeight: font.weight.semibold, fontFamily: font.family,
              cursor: 'pointer', alignSelf: 'flex-start',
            }}
          >
            Apply Static
          </button>
        </div>
      </div>
    </div>
  )
}
