import { Camera, Mic, MoreHorizontal, Video, Volume2, VolumeX } from 'lucide-react'
import { color, glass } from '@/design-system/tokens'

/**
 * Camera controls — always overlaid regardless of which hero view (camera or
 * map) is dominant, since these act on the live feed itself, not the viewport.
 * Snapshot and Audio (mute) are wired to real actions; the rest mirror the
 * original design's decorative affordances (Record/Mic/More).
 */
export function MediaControlsOverlay({
  onSnapshot, muted, onToggleMute,
}: {
  onSnapshot: () => void
  muted?: boolean
  onToggleMute?: () => void
}) {
  const items: { icon: React.ElementType; label: string; onClick?: () => void; active?: boolean }[] = [
    { icon: Camera, label: 'Snapshot', onClick: onSnapshot },
    { icon: Video, label: 'Record' },
    { icon: Mic, label: 'Mic' },
    { icon: muted ? VolumeX : Volume2, label: muted ? 'Unmute' : 'Mute', onClick: onToggleMute, active: muted },
    { icon: MoreHorizontal, label: 'More' },
  ]

  return (
    <div style={{
      ...glass.overlay, position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
      display: 'flex', alignItems: 'center', gap: 4, borderRadius: 10, padding: '6px 10px', zIndex: 900,
    }}>
      {items.map(({ icon: Icon, label, onClick, active }) => (
        <button
          key={label}
          title={label}
          onClick={onClick}
          style={{
            width: 36, height: 36, borderRadius: 7,
            background: active ? color.redBg : 'transparent',
            border: `1px solid ${active ? color.redBorder : 'rgba(255,255,255,0.07)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: active ? color.red : 'rgba(255,255,255,0.55)', cursor: onClick ? 'pointer' : 'default',
          }}
        >
          <Icon size={15} strokeWidth={1.5} />
        </button>
      ))}
    </div>
  )
}
