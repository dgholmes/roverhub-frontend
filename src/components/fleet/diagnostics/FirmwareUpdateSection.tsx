import { useEffect, useRef, useState } from 'react'
import { Check, Download } from 'lucide-react'
import { color, font, radius, space } from '@/design-system/tokens'
import type { FirmwareUpdate } from '@/types'

export function FirmwareUpdateSection({ firmware }: { firmware: FirmwareUpdate }) {
  const [installedVersion, setInstalledVersion] = useState(firmware.current_version)
  const [progress, setProgress] = useState<number | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current) }, [])

  const upToDate = !firmware.available_version || installedVersion === firmware.available_version

  function startDownload() {
    setProgress(0)
    intervalRef.current = setInterval(() => {
      setProgress((p) => {
        if (p === null) return null
        if (p >= 100) {
          if (intervalRef.current) clearInterval(intervalRef.current)
          setInstalledVersion(firmware.available_version ?? installedVersion)
          return null
        }
        return p + 10
      })
    }, 250)
  }

  return (
    <div style={{ border: `1px solid ${color.border}`, borderRadius: radius.md, padding: space[4], display: 'flex', flexDirection: 'column', gap: space[3] }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: font.size.sm, color: color.t3, marginBottom: 4 }}>Installed version</div>
          <div style={{ fontSize: font.size.lg, fontWeight: font.weight.semibold, color: color.t1, fontFamily: 'monospace' }}>
            {installedVersion}
          </div>
        </div>
        {upToDate && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: color.green, fontSize: font.size.sm, fontWeight: font.weight.semibold }}>
            <Check size={14} /> Up to date
          </div>
        )}
      </div>

      {!upToDate && (
        <div style={{ background: color.card, border: `1px solid ${color.border}`, borderRadius: radius.md, padding: space[3] }}>
          <div style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.t1, marginBottom: 4 }}>
            Firmware {firmware.available_version} available
            {firmware.size_mb != null && <span style={{ color: color.t3, fontWeight: font.weight.regular }}> · {firmware.size_mb.toFixed(2)} MB</span>}
          </div>
          <ul style={{ margin: `${space[2]}px 0`, paddingLeft: 18, fontSize: font.size.sm, color: color.t2 }}>
            {firmware.release_notes.map((note, i) => <li key={i}>{note}</li>)}
          </ul>

          {progress === null ? (
            <button
              onClick={startDownload}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: radius.md,
                background: color.accentDim, border: `1px solid ${color.accentBorder}`, color: color.accent,
                fontSize: font.size.sm, fontWeight: font.weight.semibold, fontFamily: font.family, cursor: 'pointer',
              }}
            >
              <Download size={13} /> Download & Install
            </button>
          ) : (
            <div>
              <div style={{ height: 6, background: color.border, borderRadius: radius.full, overflow: 'hidden', marginBottom: 4 }}>
                <div style={{ width: `${progress}%`, height: '100%', background: color.accent, borderRadius: radius.full, transition: 'width 0.2s linear' }} />
              </div>
              <div style={{ fontSize: font.size.xs, color: color.t3 }}>Downloading… {progress}%</div>
            </div>
          )}

          <div style={{ fontSize: font.size.xs, color: color.t3, marginTop: space[2] }}>
            Ensure battery is above 30% and do not close the connection during the upgrade.
          </div>
        </div>
      )}
    </div>
  )
}
