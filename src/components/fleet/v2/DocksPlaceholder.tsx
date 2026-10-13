import { useTranslation } from 'react-i18next'
import { PlugZap } from 'lucide-react'
import { color, font, space } from '@/design-system/tokens'
import { EmptyState, PendingBadge, Section } from './parts'

const COMING = ['coming1', 'coming2', 'coming3', 'coming4'] as const

/** The RoverHub charging dock is not on sale yet. This keeps its place in
 * Fleet without inventing dock records. */
export function DocksPlaceholder() {
  const { t } = useTranslation()
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: `${space[5]}px` }}>
      <div style={{ maxWidth: 720, display: 'flex', flexDirection: 'column', gap: space[3] }}>
        <EmptyState title={t('fleetDetail.docks.title')} icon={PlugZap}>
          {t('fleetDetail.docks.body')}
        </EmptyState>
        <Section title={t('fleetDetail.docks.willShow')} aside={<PendingBadge field="dock" />}>
          <ul style={{ margin: 0, paddingLeft: space[5], color: color.t2, fontSize: font.size.md, lineHeight: 1.8 }}>
            {COMING.map((c) => <li key={c}>{t(`fleetDetail.docks.${c}`)}</li>)}
          </ul>
        </Section>
      </div>
    </div>
  )
}
