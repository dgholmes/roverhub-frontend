import { color, font, radius, space } from '@/design-system/tokens'
import { useSessionStore, type ViewMode } from '@/legacy/liveops-v1/store/useSessionStore'

const MODES: { mode: ViewMode; label: string; future?: boolean }[] = [
  { mode: 'default', label: 'Default' },
  { mode: 'cockpit', label: 'Cockpit' },
  { mode: 'split',   label: 'Split' },
  { mode: 'grid',    label: '2×2 Grid', future: true },
]

/** LiveOps view-mode switcher (docs/05-ui-ux.md §4). The 2×2 Patrol Grid mode
 * is R2-only — visible, labeled, and permanently disabled per §14 / §18.3
 * (present controls communicate the roadmap; they must never just disappear). */
export function ViewModeSelector() {
  const viewMode = useSessionStore((s) => s.viewMode)
  const setViewMode = useSessionStore((s) => s.setViewMode)

  return (
    <div
      style={{
        display: 'flex', gap: 2, background: color.card, borderRadius: radius.md,
        padding: 2, border: `1px solid ${color.border}`,
      }}
    >
      {MODES.map(({ mode, label, future }) => {
        const isActive = mode === viewMode
        return (
          <button
            key={mode}
            disabled={future}
            title={future ? 'Coming in R2' : undefined}
            onClick={() => !future && setViewMode(mode)}
            style={{
              padding: `4px ${space[2] + 2}px`, borderRadius: radius.sm, border: 'none',
              background: isActive ? color.accent : 'transparent',
              color: future ? color.t4 : isActive ? color.accentText : color.t2,
              fontSize: font.size.xs, fontWeight: isActive ? font.weight.bold : font.weight.medium,
              fontFamily: font.family, cursor: future ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap',
            }}
          >
            {label}
            {future && (
              <span style={{
                fontSize: 8, fontWeight: 700, color: color.t3,
                border: `1px solid ${color.borderLt}`, borderRadius: radius.xs, padding: '0 3px',
              }}>
                R2
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
