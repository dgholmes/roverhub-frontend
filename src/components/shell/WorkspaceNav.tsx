import { color, font, radius, space, motion } from '@/design-system/tokens'
import { WORKSPACES, type Workspace } from '@/app/routes'

export function WorkspaceNav({ active, onSelect }: { active: Workspace; onSelect: (w: Workspace) => void }) {
  return (
    <nav style={{ flex: 1, display: 'flex', justifyContent: 'center', gap: space[1] }}>
      {WORKSPACES.map((w) => {
        const isActive = w === active
        return (
          <button
            key={w}
            onClick={() => onSelect(w)}
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
            {w}
          </button>
        )
      })}
    </nav>
  )
}
