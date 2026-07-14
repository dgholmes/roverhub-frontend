import { useState } from 'react'
import { color, font, radius, space } from '@/design-system/tokens'
import { legLabel } from '@/mocks/mockDiagnostics'
import type { MotorDiagnostics } from '@/types'

type FieldKey = 'position_deg' | 'velocity_dps' | 'torque_nm' | 'motor_temp_c' | 'error_flag'

const FIELDS: { key: FieldKey; label: string; format: (j: MotorDiagnostics) => string }[] = [
  { key: 'position_deg', label: 'Position', format: (j) => `${j.position_deg.toFixed(1)}°` },
  { key: 'velocity_dps', label: 'Velocity', format: (j) => `${j.velocity_dps.toFixed(1)}°/s` },
  { key: 'torque_nm', label: 'Torque', format: (j) => `${j.torque_nm.toFixed(1)} N·m` },
  { key: 'motor_temp_c', label: 'Motor Temp', format: (j) => `${j.motor_temp_c}°C` },
  { key: 'error_flag', label: 'Error Flag', format: (j) => j.error_flag[0].toUpperCase() + j.error_flag.slice(1) },
]

const ERROR_COLOR: Record<MotorDiagnostics['error_flag'], string> = {
  normal: color.green, warning: color.amber, fault: color.red,
}

/** Approximate joint anchor points (% of the joints.png illustration's width/height).
 * The illustration is a decorative side-view, not a precision CAD reference, so these
 * are visually-estimated hip/thigh/knee positions per leg — grouped left/right by
 * which half of the illustration each leg falls in, matching the reference app's
 * fan-out-with-leader-lines layout (reference_images/KakaoTalk_...07.png). */
const ANCHORS: Record<string, { x: number; y: number; side: 'left' | 'right' }> = {
  front_left_hip: { x: 38, y: 46, side: 'left' },
  front_left_thigh: { x: 39.5, y: 58, side: 'left' },
  front_left_knee: { x: 35.5, y: 74, side: 'left' },
  front_right_hip: { x: 46.5, y: 44, side: 'left' },
  front_right_thigh: { x: 48.5, y: 58, side: 'left' },
  front_right_knee: { x: 44.5, y: 74, side: 'left' },
  rear_left_hip: { x: 61.5, y: 44, side: 'right' },
  rear_left_thigh: { x: 57.5, y: 58, side: 'right' },
  rear_left_knee: { x: 55.5, y: 74, side: 'right' },
  rear_right_hip: { x: 67, y: 44, side: 'right' },
  rear_right_thigh: { x: 65.5, y: 59, side: 'right' },
  rear_right_knee: { x: 65, y: 74, side: 'right' },
}

const VB_W = 1600
const VB_H = 900
const LABEL_X_LEFT = 30
const LABEL_X_RIGHT = VB_W - 30

function distribute(count: number, from: number, to: number): number[] {
  if (count <= 1) return [(from + to) / 2]
  const step = (to - from) / (count - 1)
  return Array.from({ length: count }, (_, i) => from + step * i)
}

function jointLabel(j: MotorDiagnostics): string {
  return `${legLabel(j.leg)} ${j.joint_name[0].toUpperCase()}${j.joint_name.slice(1)}`
}

function Callout({
  joint, labelX, labelY, side, field,
}: {
  joint: MotorDiagnostics
  labelX: number
  labelY: number
  side: 'left' | 'right'
  field: (typeof FIELDS)[number]
}) {
  const anchor = ANCHORS[joint.joint_id]
  const ax = (anchor.x / 100) * VB_W
  const ay = (anchor.y / 100) * VB_H
  const jogX = side === 'left' ? labelX + 130 : labelX - 130
  const textAnchor = side === 'left' ? 'start' : 'end'
  const valueColor = field.key === 'error_flag' ? ERROR_COLOR[joint.error_flag] : color.t1

  return (
    <g>
      <polyline
        points={`${ax},${ay} ${jogX},${labelY} ${labelX},${labelY}`}
        fill="none" stroke={color.blue} strokeWidth={1.25} opacity={0.55}
      />
      <circle cx={ax} cy={ay} r={4.5} fill={color.blue} opacity={0.9} />
      <text x={labelX} y={labelY - 7} textAnchor={textAnchor} fill={color.svgMuted}
        fontSize={font.size.xs} fontFamily={font.family}>
        {jointLabel(joint)}
      </text>
      <text x={labelX} y={labelY + 13} textAnchor={textAnchor} fill={valueColor}
        fontSize={font.size.lg} fontWeight={font.weight.bold} fontFamily={font.family}>
        {field.format(joint)}
      </text>
    </g>
  )
}

/** Illustrated joint diagram with leader-line callouts, matching the reference app's
 * "Joint Information" screen layout — a field selector switches which reading each
 * callout displays, rather than one static image per field. */
export function JointDiagram({ joints }: { joints: MotorDiagnostics[] }) {
  const [field, setField] = useState<FieldKey>('motor_temp_c')
  const activeField = FIELDS.find((f) => f.key === field)!

  const left = joints.filter((j) => ANCHORS[j.joint_id]?.side === 'left')
  const right = joints.filter((j) => ANCHORS[j.joint_id]?.side === 'right')
  const leftYs = distribute(left.length, 70, VB_H - 70)
  const rightYs = distribute(right.length, 70, VB_H - 70)

  return (
    <div style={{
      display: 'flex', gap: space[4], padding: space[4],
      background: color.card, border: `1px solid ${color.border}`, borderRadius: radius.md,
    }}>
      <div style={{ position: 'relative', flex: '1 1 auto', minWidth: 0, aspectRatio: `${VB_W}/${VB_H}` }}>
        <img src="/joints.png" alt="Joint diagram" style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
        <svg viewBox={`0 0 ${VB_W} ${VB_H}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
          {left.map((j, i) => (
            <Callout key={j.joint_id} joint={j} labelX={LABEL_X_LEFT} labelY={leftYs[i]} side="left" field={activeField} />
          ))}
          {right.map((j, i) => (
            <Callout key={j.joint_id} joint={j} labelX={LABEL_X_RIGHT} labelY={rightYs[i]} side="right" field={activeField} />
          ))}
        </svg>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: space[1], minWidth: 130, flexShrink: 0 }}>
        {FIELDS.map((f) => (
          <button
            key={f.key}
            onClick={() => setField(f.key)}
            style={{
              textAlign: 'left', padding: `${space[2]}px ${space[3]}px`, borderRadius: radius.sm,
              border: 'none', cursor: 'pointer', fontFamily: font.family, fontSize: font.size.md,
              background: field === f.key ? color.accent : 'transparent',
              color: field === f.key ? color.accentText : color.t2,
              fontWeight: field === f.key ? font.weight.bold : font.weight.regular,
            }}
          >
            {f.label}
          </button>
        ))}
      </div>
    </div>
  )
}
