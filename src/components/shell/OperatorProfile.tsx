import { ChevronDown } from 'lucide-react'
import { color, font, space } from '@/design-system/tokens'
import { useSessionStore } from '@/store/useSessionStore'

/** Shared by TopBar (site level) and OrgTopBar (org level). */
export function OperatorProfile() {
  const operatorName = useSessionStore((s) => s.operatorName)
  const role = useSessionStore((s) => s.role)

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: space[2], cursor: 'pointer' }}>
      <div style={{
        width: 30, height: 30, borderRadius: '50%',
        background: color.card, border: `1.5px solid ${color.borderLt}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        fontSize: font.size.sm, fontWeight: font.weight.bold, color: color.t2,
        fontFamily: font.family, letterSpacing: '-0.02em',
      }}>
        {operatorName.split(' ').map((p) => p[0]).slice(0, 2).join('')}
      </div>
      <div>
        <div style={{ fontSize: font.size.md, fontWeight: font.weight.semibold, color: color.t1, lineHeight: 1.3 }}>
          {operatorName}
        </div>
        <div style={{ fontSize: font.size.xs, color: color.t3, lineHeight: 1.2, textTransform: 'capitalize' }}>
          {role}
        </div>
      </div>
      <ChevronDown size={12} color={color.t3} strokeWidth={2} />
    </div>
  )
}
