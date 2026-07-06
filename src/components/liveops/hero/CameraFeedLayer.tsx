import { VideoOff } from 'lucide-react'
import { color, font, space } from '@/design-system/tokens'
import type { RobotState } from '@/types'

/**
 * The live camera image plane — usable as either the hero background or,
 * scaled down, the mini inset. If DDS is unavailable the feed does not go
 * blank; it keeps the last frame with a paused overlay (docs/05-ui-ux.md §8, §14).
 */
export function CameraFeedLayer({ robot }: { robot: RobotState }) {
  const ddsAvailable = robot.connectivity.dds === 'connected'

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: '#0B0E12' }}>
      <img
        src="/live_view.png"
        alt=""
        style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%',
          objectFit: 'cover', objectPosition: 'center', display: 'block',
          filter: ddsAvailable ? undefined : 'grayscale(0.6) brightness(0.5)',
        }}
      />
      <div style={{
        position: 'absolute', inset: 0, opacity: 0.03, pointerEvents: 'none',
        backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.6) 2px, rgba(255,255,255,0.6) 3px)',
      }} />

      {!ddsAvailable && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: space[2],
          background: 'rgba(8,8,10,0.55)', textAlign: 'center', padding: space[4],
        }}>
          <VideoOff size={22} color={color.t2} strokeWidth={1.5} />
          <span style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.t1 }}>
            Feed paused — DDS connection lost
          </span>
          <span style={{ fontSize: font.size.xs, color: color.t3 }}>Showing last received frame</span>
        </div>
      )}
    </div>
  )
}
