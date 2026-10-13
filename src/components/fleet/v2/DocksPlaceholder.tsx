import { PlugZap } from 'lucide-react'
import { color, font, space } from '@/design-system/tokens'
import { EmptyState, PendingBadge, Section } from './parts'

const COMING = [
  'Which dock each robot uses, and whether it is docked now',
  'Docking progress and failures',
  'When each dock was last used',
  'Charging current, so a full battery and a charging one can be told apart',
]

/** The RoverHub charging dock is not on sale yet. This keeps its place in
 * Fleet without inventing dock records. */
export function DocksPlaceholder() {
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: `${space[5]}px` }}>
      <div style={{ maxWidth: 720, display: 'flex', flexDirection: 'column', gap: space[3] }}>
        <EmptyState title="Charging dock" icon={PlugZap}>
          The charging dock isn't available yet. Dock status, docking and charging will show here once it ships.
        </EmptyState>
        <Section title="What this page will show" aside={<PendingBadge field="dock" />}>
          <ul style={{ margin: 0, paddingLeft: space[5], color: color.t2, fontSize: font.size.md, lineHeight: 1.8 }}>
            {COMING.map((c) => <li key={c}>{c}</li>)}
          </ul>
        </Section>
      </div>
    </div>
  )
}
