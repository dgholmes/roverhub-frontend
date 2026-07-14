import { color, font, radius, space } from '@/design-system/tokens'
import type { VersionInfo } from '@/types'

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: `${space[2] + 2}px ${space[3]}px`, borderBottom: `1px solid ${color.border}`,
    }}>
      <span style={{ fontSize: font.size.sm, color: color.t3 }}>{label}</span>
      <span style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.t1, fontFamily: 'monospace' }}>{value}</span>
    </div>
  )
}

export function VersionInfoSection({ version }: { version: VersionInfo }) {
  return (
    <div style={{ border: `1px solid ${color.border}`, borderRadius: radius.md, overflow: 'hidden' }}>
      <Row label="Algorithm" value={version.algorithm} />
      <Row label="CAN Board" value={version.can_board} />
      <Row label="BMS" value={version.bms} />
      <Row label="Controller" value={version.controller} />
      <Row label="System" value={version.system} />
      <Row label="Battery Group" value={version.battery_group} />
      <Row label="Audio" value={version.audio} />
      <Row label="Servo — Front Left" value={version.servo_by_leg.front_left} />
      <Row label="Servo — Front Right" value={version.servo_by_leg.front_right} />
      <Row label="Servo — Rear Left" value={version.servo_by_leg.rear_left} />
      <Row label="Servo — Rear Right" value={version.servo_by_leg.rear_right} />
    </div>
  )
}
