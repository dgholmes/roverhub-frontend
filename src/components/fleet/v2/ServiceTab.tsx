import { color, font, space } from '@/design-system/tokens'
import { robotTypeLabel } from '@/lib/robotCapabilities'
import type { PendingKey } from '@/fleet/pendingFromDobot'
import { PENDING_FROM_DOBOT } from '@/fleet/pendingFromDobot'
import type { RobotState } from '@/types'
import { Muted, PendingBadge, Section } from './parts'

const ITEMS: { key: PendingKey; does: string }[] = [
  { key: 'calibration', does: 'Start joint and IMU calibration and see whether it passed.' },
  { key: 'firmware_update', does: 'Install new robot firmware and follow its progress.' },
  { key: 'joint_limits', does: 'See each joint’s allowed range and torque limit.' },
  { key: 'traffic', does: 'See how much mobile data the robot has used this month.' },
  { key: 'led_health', does: 'Know when the light bar has failed.' },
  { key: 'voice_health', does: 'Know when the speaker or microphone has failed.' },
]

/**
 * Service tools the robot's own app has but its SDK does not expose. They
 * stay listed, each with the question we have put to Dobot, instead of the
 * simulated progress bars the old drawer showed.
 */
export function ServiceTab({ robot }: { robot: RobotState }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
      <p style={{ margin: 0, fontSize: font.size.md, color: color.t2, lineHeight: 1.5, maxWidth: 720 }}>
        These need data or controls the robot's SDK doesn't offer yet. We've asked Dobot about each one, and
        they'll turn on here as answers come in.
      </p>
      <Section title="Foot type" aside={<PendingBadge field="foot_type" />}>
        <span style={{ fontSize: font.size.md, color: color.t1 }}>{robotTypeLabel(robot.robot_type)}</span>{' '}
        <Muted>· from the robot type it reports. The fitted foot itself can't be read.</Muted>
      </Section>
      <Section title="Waiting on Dobot">
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {ITEMS.map(({ key, does }) => (
            <li key={key} style={{
              display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap',
              padding: `${space[2]}px 0`, borderBottom: `1px solid ${color.border}`,
            }}>
              <span style={{ width: 180, fontSize: font.size.md, fontWeight: font.weight.semibold, color: color.t1 }}>
                {PENDING_FROM_DOBOT[key].label}
              </span>
              <span style={{ flex: 1, minWidth: 200, fontSize: font.size.md, color: color.t2 }}>{does}</span>
              <PendingBadge field={key} />
            </li>
          ))}
        </ul>
      </Section>
    </div>
  )
}
