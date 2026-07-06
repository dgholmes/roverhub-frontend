import { color, font, radius, space, motion } from '@/design-system/tokens'
import { ORG_PAGES, type OrgPage } from '@/app/routes'

/** Org-level top-tab nav — mirrors the original WorkspaceNav's exact style,
 * kept as top tabs per operator feedback (only the site level moved to a
 * sidebar; the org level keeps its top bar and top-tab navigation as-is). */
export function OrgNav({ active, onSelect }: { active: OrgPage; onSelect: (p: OrgPage) => void }) {
  return (
    <nav style={{ flex: 1, display: 'flex', justifyContent: 'center', gap: space[1] }}>
      {ORG_PAGES.map((p) => {
        const isActive = p === active
        return (
          <button
            key={p}
            onClick={() => onSelect(p)}
            style={{
              padding: '6px 16px', borderRadius: radius.md,
              border: isActive ? `1px solid ${color.borderLt}` : '1px solid transparent',
              background: isActive ? 'rgba(255,255,255,0.07)' : 'transparent',
              color: isActive ? color.t1 : color.t2,
              fontFamily: font.family,
              fontSize: font.size.lg, fontWeight: isActive ? font.weight.semibold : font.weight.regular,
              cursor: 'pointer', letterSpacing: '-0.01em',
              transition: `color ${motion.default}, background ${motion.default}`,
            }}
          >
            {p}
          </button>
        )
      })}
    </nav>
  )
}
