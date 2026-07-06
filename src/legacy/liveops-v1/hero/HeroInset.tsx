import { ArrowLeftRight } from 'lucide-react'
import { color, font, glass, radius } from '@/design-system/tokens'
import { MapCanvas } from '@/legacy/liveops-v1/map/MapCanvas'
import type { Mission, RobotState } from '@/legacy/liveops-v1/types'

/**
 * Bottom-left inset showing whichever view (map or camera) is NOT currently
 * the hero. Its swap icon is what promotes it to the large view — this is
 * the single control that toggles HeroView's mode.
 */
export function HeroInset({
  showing, robot, mission, onSwap,
}: {
  showing: 'camera' | 'map'
  robot: RobotState
  mission?: Mission
  onSwap: () => void
}) {
  return (
    <div style={{
      ...glass.overlay, position: 'absolute', bottom: 12, left: 12, zIndex: 900,
      width: 176, borderRadius: radius.md, overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 10px',
        background: 'rgba(8,8,10,0.30)', backdropFilter: 'blur(4px)', borderBottom: '1px solid rgba(255,255,255,0.07)',
      }}>
        <span style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.t1 }}>
          {showing === 'map' ? 'Map' : 'Camera'}
        </span>
        <button
          onClick={onSwap}
          title={`Switch ${showing === 'map' ? 'map' : 'camera'} to large view`}
          aria-label={`Switch ${showing === 'map' ? 'map' : 'camera'} to large view`}
          style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', display: 'flex' }}
        >
          <ArrowLeftRight size={11} strokeWidth={1.6} />
        </button>
      </div>
      <div style={{ width: 176, height: 106, position: 'relative' }}>
        {showing === 'map' ? (
          <MapCanvas robot={robot} mission={mission} variant="mini" />
        ) : (
          <img src="/live_view.png" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        )}
      </div>
    </div>
  )
}
