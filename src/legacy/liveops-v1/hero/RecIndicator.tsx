import { useEffect, useState } from 'react'
import { glass } from '@/design-system/tokens'

function fmt(totalSec: number): string {
  const h = Math.floor(totalSec / 3600).toString().padStart(2, '0')
  const m = Math.floor((totalSec % 3600) / 60).toString().padStart(2, '0')
  const s = Math.floor(totalSec % 60).toString().padStart(2, '0')
  return `${h}:${m}:${s}`
}

/** Decorative session-recording indicator — footage capture runs continuously
 * regardless of which hero view (camera or map) the operator is looking at. */
export function RecIndicator() {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const t = setInterval(() => setElapsed((e) => e + 1), 1000)
    return () => clearInterval(t)
  }, [])

  return (
    <div style={{
      ...glass.overlay, position: 'absolute', top: 12, right: 12, zIndex: 900,
      display: 'flex', alignItems: 'center', gap: 6, borderRadius: 6, padding: '5px 10px',
    }}>
      <span className="rec-dot" style={{
        width: 7, height: 7, borderRadius: '50%', background: '#FF453A',
        display: 'inline-block', boxShadow: '0 0 6px rgba(255,67,58,0.9)',
      }} />
      <span style={{ fontSize: 11, fontWeight: 700, color: '#FFFFFF', letterSpacing: '0.05em' }}>REC</span>
      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.40)', letterSpacing: '0.03em' }}>{fmt(elapsed)}</span>
    </div>
  )
}
