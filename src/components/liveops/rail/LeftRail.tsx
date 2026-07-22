import { color, font, layout, space } from '@/design-system/tokens'
import { RobotList } from './RobotList'

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: font.size.xs, fontWeight: font.weight.bold, color: color.t3,
      letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: space[2] + 2,
    }}>
      {children}
    </div>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: `${space[3] + 2}px ${space[4]}px`, borderBottom: `1px solid ${color.border}` }}>
      <SectionLabel>{label}</SectionLabel>
      {children}
    </div>
  )
}

/** LiveOps left rail (docs/05-ui-ux.md §3) — always visible, never collapsed
 * except in Cockpit view mode. */
export function LeftRail() {
  return (
    <aside style={{
      width: layout.liveOpsRailWidth, flexShrink: 0,
      background: color.surface, borderRight: `1px solid ${color.border}`,
      display: 'flex', flexDirection: 'column', overflowY: 'auto', overflowX: 'hidden',
    }}>
      <Section label="Fleet">
        <RobotList />
      </Section>
    </aside>
  )
}
