import { color, font, radius, space } from '@/design-system/tokens'

/** The 3D view's status line: "no cloud", "loading", "could not read it".
 *  Lives apart from CloudViewer3D so MapDetailPanel can show it without
 *  pulling three.js in. A dot and a tint, no outline. */
export function CloudEmptyState({ message }: { message: string }) {
  return (
    <div
      role="status"
      style={{
        display: 'flex', alignItems: 'center', gap: space[2], boxSizing: 'border-box',
        minHeight: 64, padding: `${space[3]}px ${space[4]}px`, borderRadius: radius.md,
        background: color.mapBg, fontFamily: font.family, fontSize: font.size.md, color: color.t2,
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: radius.full, flexShrink: 0, background: color.t3 }} />
      {message}
    </div>
  )
}
