import { color, font, space } from '@/design-system/tokens'
import { LiveOpsWorkspace } from './LiveOpsWorkspace'
import { ViewModeSelector } from './ViewModeSelector'

/**
 * Frozen reference snapshot of LiveOps as it stood before the next round of
 * big changes. Fully self-contained (its own copy of the liveops component
 * tree, store, types, mocks, and helpers) so later edits to the live app
 * cannot affect what's shown here. Reachable at #/legacy/liveops-v1 — not
 * part of the live app's navigation.
 */
export default function LiveOpsV1Page() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: color.bg, fontFamily: font.family }}>
      <div style={{
        height: 40, flexShrink: 0, display: 'flex', alignItems: 'center', gap: space[3],
        padding: `0 ${space[4]}px`, background: color.surface, borderBottom: `1px solid ${color.border}`,
      }}>
        <span style={{ fontSize: font.size.sm, fontWeight: font.weight.bold, color: color.accent }}>
          LiveOps v1 — Reference Snapshot
        </span>
        <a href="#/liveops" style={{ fontSize: font.size.xs, color: color.t3, textDecoration: 'underline' }}>
          ← Back to current LiveOps
        </a>
        <div style={{ marginLeft: 'auto' }}>
          <ViewModeSelector />
        </div>
      </div>
      <LiveOpsWorkspace />
    </div>
  )
}
