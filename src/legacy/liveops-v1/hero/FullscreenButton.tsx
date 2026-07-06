import { Maximize2, Minimize2 } from 'lucide-react'
import { color } from '@/design-system/tokens'

export function FullscreenButton({ isFullscreen, onToggle }: { isFullscreen: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
      aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
      style={{
        width: 28, height: 28, borderRadius: 6, background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: color.t3, cursor: 'pointer', flexShrink: 0,
      }}
    >
      {isFullscreen ? <Minimize2 size={13} strokeWidth={1.5} /> : <Maximize2 size={13} strokeWidth={1.5} />}
    </button>
  )
}
