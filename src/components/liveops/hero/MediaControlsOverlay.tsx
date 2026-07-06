import { Camera, Mic, MoreHorizontal, Video, Volume2 } from 'lucide-react'
import { glass } from '@/design-system/tokens'

/**
 * Camera controls — always overlaid regardless of which hero view (camera or
 * map) is dominant, since these act on the live feed itself, not the viewport.
 * Only Snapshot is wired to a real command; the rest mirror the original
 * design's decorative affordances (Record/Mic/Audio/More).
 */
export function MediaControlsOverlay({ onSnapshot }: { onSnapshot: () => void }) {
  const items: { icon: React.ElementType; label: string; onClick?: () => void }[] = [
    { icon: Camera, label: 'Snapshot', onClick: onSnapshot },
    { icon: Video, label: 'Record' },
    { icon: Mic, label: 'Mic' },
    { icon: Volume2, label: 'Audio' },
    { icon: MoreHorizontal, label: 'More' },
  ]

  return (
    <div style={{
      ...glass.overlay, position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
      display: 'flex', alignItems: 'center', gap: 4, borderRadius: 10, padding: '6px 10px', zIndex: 900,
    }}>
      {items.map(({ icon: Icon, label, onClick }) => (
        <button
          key={label}
          title={label}
          onClick={onClick}
          style={{
            width: 36, height: 36, borderRadius: 7, background: 'transparent',
            border: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'rgba(255,255,255,0.55)', cursor: onClick ? 'pointer' : 'default',
          }}
        >
          <Icon size={15} strokeWidth={1.5} />
        </button>
      ))}
    </div>
  )
}
