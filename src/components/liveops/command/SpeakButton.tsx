import { useEffect, useRef, useState } from 'react'
import { Lock, Mic2, Play as PlayIcon, Plus, Square, Unlock, Upload } from 'lucide-react'
import { color, font, layout, radius, space } from '@/design-system/tokens'
import { DisabledReasonButton } from '@/components/common/DisabledReason'
import type { CommandAvailability } from '@/types'

type Tab = 'play' | 'shout'

const PRESET_CLIPS = [
  { id: 'stand-clear', label: 'Stand Clear' },
  { id: 'patrol-greeting', label: 'Patrol Greeting' },
]

/**
 * Speak, upgraded from a plain fire-and-forget command to a small popover
 * matching the reference app's Play (preset clip) / Shout (hold-to-talk)
 * split (LIVEOPS_AUDIT_TRACKER.md 4.1) — SDK-confirmed as a real distinction,
 * not just reference-app UX: the vendored SDK's VoiceCmd has a genuine
 * `type: "file"` (play a path) vs. `type: "streaming"` (live mic capture)
 * mode. Both still dispatch through the existing SPEAK command lifecycle —
 * this only changes what the operator picks before it fires.
 *
 * Play tab supports adding clips (real file upload via a hidden file input,
 * or a mock "record new clip" flow — this app has no real audio capture
 * pipeline anywhere yet, so recording is timed/simulated rather than faked
 * with a nonexistent getUserMedia call). Shout tab supports a lock toggle:
 * unlocked is hold-to-talk (press and hold, release to send); locked turns
 * it into press-to-start / press-again-to-finish-and-send.
 */
export function SpeakButton({
  availability, onPlay, onShout,
}: {
  availability: CommandAvailability
  onPlay: (clip: string) => void
  onShout: () => void
}) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('play')
  const [shouting, setShouting] = useState(false)
  const [locked, setLocked] = useState(false)
  const [clips, setClips] = useState(PRESET_CLIPS)
  const [addingClip, setAddingClip] = useState(false)
  const [recording, setRecording] = useState(false)
  const [recordSeconds, setRecordSeconds] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onClickOutside)
    return () => window.removeEventListener('mousedown', onClickOutside)
  }, [open])

  useEffect(() => {
    if (!recording) return
    const t = setInterval(() => setRecordSeconds((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [recording])

  function addClip(label: string) {
    setClips((c) => [...c, { id: `clip-${Date.now()}`, label }])
    setAddingClip(false)
  }

  function handleFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) addClip(file.name.replace(/\.[^.]+$/, ''))
    e.target.value = ''
  }

  function toggleRecording() {
    if (recording) {
      addClip(`Recording (${recordSeconds}s)`)
      setRecording(false)
      setRecordSeconds(0)
    } else {
      setRecordSeconds(0)
      setRecording(true)
    }
  }

  function handleShoutPress() {
    if (!locked) return
    if (shouting) {
      setShouting(false)
      onShout()
      setOpen(false)
    } else {
      setShouting(true)
    }
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <DisabledReasonButton
        enabled={availability.enabled}
        reason={availability.reason}
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 4, height: layout.actionBtnHeight, minWidth: 64, padding: '0 14px',
          background: open ? color.cardHover : color.card, border: `1px solid ${open ? color.borderLt : color.border}`,
          borderRadius: radius.md, color: color.t2, fontFamily: font.family, flexShrink: 0,
        }}
      >
        <Mic2 size={16} strokeWidth={1.6} />
        <span style={{ fontSize: font.size.xs, fontWeight: font.weight.semibold, whiteSpace: 'nowrap' }}>Speak</span>
      </DisabledReasonButton>

      {open && (
        <div style={{
          position: 'absolute', bottom: 'calc(100% + 8px)', right: 0, width: 220,
          background: color.elevated, border: `1px solid ${color.border}`, borderRadius: radius.lg,
          padding: space[2], zIndex: 50,
        }}>
          <div style={{ display: 'flex', gap: 2, marginBottom: space[2] }}>
            {(['play', 'shout'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  flex: 1, padding: '5px 0', borderRadius: radius.sm, fontSize: font.size.sm, fontFamily: font.family,
                  background: tab === t ? color.cardHover : 'transparent',
                  border: `1px solid ${tab === t ? color.borderLt : 'transparent'}`,
                  color: tab === t ? color.t1 : color.t3, fontWeight: tab === t ? font.weight.semibold : font.weight.regular,
                  cursor: 'pointer', textTransform: 'capitalize',
                }}
              >
                {t}
              </button>
            ))}
          </div>

          {tab === 'play' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {clips.map((clip) => (
                <button
                  key={clip.id}
                  onClick={() => { onPlay(clip.label); setOpen(false) }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderRadius: radius.sm,
                    background: 'transparent', border: 'none', color: color.t1, fontSize: font.size.sm,
                    fontFamily: font.family, cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <PlayIcon size={11} strokeWidth={2} color={color.accent} />
                  {clip.label}
                </button>
              ))}

              <div style={{ height: 1, background: color.border, margin: '4px 0' }} />

              {!addingClip ? (
                <button
                  onClick={() => setAddingClip(true)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderRadius: radius.sm,
                    background: 'transparent', border: 'none', color: color.t2, fontSize: font.size.sm,
                    fontFamily: font.family, cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <Plus size={12} strokeWidth={2} />
                  Add clip
                </button>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <input ref={fileInputRef} type="file" accept="audio/*" onChange={handleFileChosen} style={{ display: 'none' }} />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderRadius: radius.sm,
                      background: 'rgba(255,255,255,0.05)', border: `1px solid ${color.border}`, color: color.t1,
                      fontSize: font.size.sm, fontFamily: font.family, cursor: 'pointer', textAlign: 'left',
                    }}
                  >
                    <Upload size={12} strokeWidth={2} />
                    Upload audio file
                  </button>
                  <button
                    onClick={toggleRecording}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderRadius: radius.sm,
                      background: recording ? color.redBg : 'rgba(255,255,255,0.05)',
                      border: `1px solid ${recording ? color.redBorder : color.border}`,
                      color: recording ? color.red : color.t1,
                      fontSize: font.size.sm, fontFamily: font.family, cursor: 'pointer', textAlign: 'left',
                    }}
                  >
                    {recording ? <Square size={11} strokeWidth={2} /> : <Mic2 size={12} strokeWidth={2} />}
                    {recording ? `Recording… ${recordSeconds}s (click to stop)` : 'Record new clip'}
                  </button>
                  {!recording && (
                    <button
                      onClick={() => setAddingClip(false)}
                      style={{
                        padding: '3px 0', border: 'none', background: 'transparent', color: color.t3,
                        fontSize: font.size.xs, fontFamily: font.family, cursor: 'pointer',
                      }}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <button
                onMouseDown={() => !locked && setShouting(true)}
                onMouseUp={() => { if (!locked) { setShouting(false); onShout(); setOpen(false) } }}
                onMouseLeave={() => !locked && setShouting(false)}
                onClick={handleShoutPress}
                style={{
                  width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                  padding: '12px 8px', borderRadius: radius.sm, fontFamily: font.family,
                  background: shouting ? color.redBg : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${shouting ? color.redBorder : color.border}`,
                  color: shouting ? color.red : color.t1, cursor: 'pointer',
                }}
              >
                <Mic2 size={18} strokeWidth={1.8} />
                <span style={{ fontSize: font.size.xs, fontWeight: font.weight.semibold }}>
                  {shouting ? (locked ? 'Speaking… click to finish & send' : 'Speaking…') : locked ? 'Click to start' : 'Hold to talk'}
                </span>
              </button>

              <button
                onClick={() => setLocked((l) => !l)}
                disabled={shouting}
                title={locked ? 'Switch back to hold-to-talk' : 'Lock — press once to start, press again to finish and send'}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                  padding: '4px 8px', borderRadius: radius.sm, fontSize: font.size.xs, fontFamily: font.family,
                  background: locked ? color.accentDim : 'transparent',
                  border: `1px solid ${locked ? color.accentBorder : color.border}`,
                  color: locked ? color.accent : color.t3, cursor: shouting ? 'not-allowed' : 'pointer',
                  opacity: shouting ? 0.5 : 1,
                }}
              >
                {locked ? <Lock size={11} strokeWidth={2} /> : <Unlock size={11} strokeWidth={2} />}
                {locked ? 'Locked' : 'Hold-to-talk'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
