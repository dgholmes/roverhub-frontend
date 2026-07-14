import { useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { color, font, radius, space } from '@/design-system/tokens'

function timeAgo(iso: string): string {
  const sec = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (sec < 3600) return `${Math.round(sec / 60)}m ago`
  if (sec < 86400) return `${Math.round(sec / 3600)}h ago`
  return `${Math.round(sec / 86400)}d ago`
}

/**
 * Leg calibration action. Self-contained mock flow (not routed through
 * LiveOps' dispatchCommand/CommandAckToast pipeline — Fleet has no toast
 * renderer in its tree, so a command dispatched from here would run its
 * ack lifecycle with zero visible feedback). Engineering-tier action,
 * scoped to Fleet's own drawer instead.
 */
export function CalibrationSection({ lastCalibratedAt }: { lastCalibratedAt: string | null }) {
  const [calibrating, setCalibrating] = useState(false)
  const [justCompletedAt, setJustCompletedAt] = useState<string | null>(null)

  function runCalibration() {
    setCalibrating(true)
    setTimeout(() => {
      setCalibrating(false)
      setJustCompletedAt(new Date().toISOString())
    }, 2500)
  }

  const displayedLast = justCompletedAt ?? lastCalibratedAt

  return (
    <div style={{ border: `1px solid ${color.border}`, borderRadius: radius.md, padding: space[4], display: 'flex', flexDirection: 'column', gap: space[3] }}>
      <div>
        <div style={{ fontSize: font.size.sm, color: color.t3, marginBottom: 4 }}>Last calibrated</div>
        <div style={{ fontSize: font.size.lg, fontWeight: font.weight.semibold, color: color.t1 }}>
          {displayedLast ? timeAgo(displayedLast) : 'Never'}
        </div>
      </div>

      <button
        onClick={runCalibration}
        disabled={calibrating}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          padding: '10px 16px', borderRadius: radius.md, alignSelf: 'flex-start',
          background: calibrating ? color.card : color.accentDim,
          border: `1px solid ${calibrating ? color.border : color.accentBorder}`,
          color: calibrating ? color.t3 : color.accent, fontSize: font.size.sm, fontWeight: font.weight.semibold,
          fontFamily: font.family, cursor: calibrating ? 'not-allowed' : 'pointer',
        }}
      >
        {calibrating ? <Loader2 size={14} className="rh-spin" /> : justCompletedAt && <Check size={14} />}
        {calibrating ? 'Calibrating legs…' : 'Calibrate Legs'}
      </button>

      <div style={{ fontSize: font.size.xs, color: color.t3 }}>
        Runs a full leg calibration sequence. The robot must be Standing and stationary — takes about 30 seconds on
        hardware.
      </div>
    </div>
  )
}
