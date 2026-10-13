import { useTranslation } from 'react-i18next'
import { color, font, space } from '@/design-system/tokens'
import { robotTypeLabel } from '@/lib/robotCapabilities'
import type { PendingKey } from '@/fleet/pendingFromDobot'
import { PENDING_FROM_DOBOT } from '@/fleet/pendingFromDobot'
import type { RobotState } from '@/types'
import { Muted, PendingBadge, Section } from './parts'

/** Each item's "what it would let you do" line is fleetDetail.service.<key>. */
const ITEMS = ['calibration', 'firmware_update', 'joint_limits', 'traffic', 'led_health', 'voice_health'] as const satisfies readonly PendingKey[]

/**
 * Service tools the robot's own app has but its SDK does not expose. They
 * stay listed, each with the question we have put to Dobot, instead of the
 * simulated progress bars the old drawer showed.
 */
export function ServiceTab({ robot }: { robot: RobotState }) {
  const { t } = useTranslation()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
      <p style={{ margin: 0, fontSize: font.size.md, color: color.t2, lineHeight: 1.5, maxWidth: 720 }}>
        {t('fleetDetail.service.intro')}
      </p>
      <Section title={t('fleetDetail.service.footType')} aside={<PendingBadge field="foot_type" />}>
        <span style={{ fontSize: font.size.md, color: color.t1 }}>{robotTypeLabel(robot.robot_type)}</span>{' '}
        <Muted>{t('fleetDetail.service.footTypeNote')}</Muted>
      </Section>
      <Section title={t('fleetDetail.service.waiting')}>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {ITEMS.map((key) => (
            <li key={key} style={{
              display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap',
              padding: `${space[2]}px 0`, borderBottom: `1px solid ${color.border}`,
            }}>
              <span style={{ width: 180, fontSize: font.size.md, fontWeight: font.weight.semibold, color: color.t1 }}>
                {PENDING_FROM_DOBOT[key].label}
              </span>
              <span style={{ flex: 1, minWidth: 200, fontSize: font.size.md, color: color.t2 }}>{t(`fleetDetail.service.${key}`)}</span>
              <PendingBadge field={key} />
            </li>
          ))}
        </ul>
      </Section>
    </div>
  )
}
