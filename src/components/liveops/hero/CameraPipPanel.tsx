import { color, font, glass, radius } from '@/design-system/tokens'

/**
 * Cockpit mode's fixed picture-in-picture camera corner (docs/05-ui-ux.md §4:
 * "camera in picture-in-picture corner"). Unlike HeroInset, this is not
 * swappable — Cockpit is a fixed arrangement, map is always the large view.
 */
export function CameraPipPanel() {
  return (
    <div style={{
      ...glass.overlay, position: 'absolute', bottom: 12, left: 12, zIndex: 900,
      width: 176, borderRadius: radius.md, overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', padding: '5px 10px',
        background: 'rgba(8,8,10,0.30)', backdropFilter: 'blur(4px)', borderBottom: '1px solid rgba(255,255,255,0.07)',
      }}>
        <span style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.t1 }}>Camera</span>
      </div>
      <div style={{ width: 176, height: 106 }}>
        <img src="/live_view.png" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      </div>
    </div>
  )
}
