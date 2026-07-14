import { Plus } from 'lucide-react'
import { color, font, radius, space } from '@/design-system/tokens'
import type { MissionLibraryEntry, MissionLibraryStatus } from '@/types'

const STATUS_COLOR: Record<MissionLibraryStatus, string> = {
  draft: color.t3, scheduled: color.accent, completed: color.green, failed: color.red,
}

function timeAgo(iso: string): string {
  const sec = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (sec < 3600) return `${Math.round(sec / 60)}m ago`
  if (sec < 86400) return `${Math.round(sec / 3600)}h ago`
  return `${Math.round(sec / 86400)}d ago`
}

/** Mission library (docs/05-ui-ux.md §11.1) — saved mission plans, filterable
 * in the full spec; MVP here is a flat list since the mock library is small. */
export function MissionLibraryPanel({
  missions, activeId, onSelect, onNew,
}: {
  missions: MissionLibraryEntry[]
  activeId: string | null
  onSelect: (id: string) => void
  onNew: () => void
}) {
  return (
    <div style={{
      width: 260, flexShrink: 0, borderRight: `1px solid ${color.border}`, background: color.surface,
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      <div style={{ padding: space[3], borderBottom: `1px solid ${color.border}` }}>
        <button
          onClick={onNew}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%',
            padding: '8px 0', borderRadius: radius.md, background: color.accentDim,
            border: `1px solid ${color.accentBorder}`, color: color.accent,
            fontSize: font.size.sm, fontWeight: font.weight.semibold, fontFamily: font.family, cursor: 'pointer',
          }}
        >
          <Plus size={14} /> New Mission
        </button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: space[2] }}>
        {missions.map((m) => {
          const active = m.mission_id === activeId
          return (
            <button
              key={m.mission_id}
              onClick={() => onSelect(m.mission_id)}
              style={{
                display: 'block', width: '100%', textAlign: 'left', padding: `${space[2]}px ${space[2] + 2}px`,
                borderRadius: radius.md, marginBottom: 2,
                background: active ? color.card : 'transparent',
                border: `1px solid ${active ? color.borderLt : 'transparent'}`, cursor: 'pointer',
              }}
            >
              <div style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.t1, marginBottom: 2 }}>
                {m.name}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: font.size.xs }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS_COLOR[m.library_status], display: 'inline-block' }} />
                <span style={{ color: STATUS_COLOR[m.library_status], textTransform: 'capitalize' }}>{m.library_status}</span>
                <span style={{ color: color.t3 }}>· {timeAgo(m.updated_at)}</span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
