import { useEffect, useRef, useState } from 'react'
import { Lock, Mic2, Play as PlayIcon, Plus, Square, Unlock, Upload, Volume2 } from 'lucide-react'
import { color, font, layout, radius, space } from '@/design-system/tokens'
import { DisabledReasonButton } from '@/components/common/DisabledReason'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'
import type { CommandAvailability } from '@/types'

type Tab = 'play' | 'say' | 'shout'

/** A Play-tab clip. `clipId` is the backend's clip identifier, which SPEAK
 * carries so the edge bridge can fetch the clip's PCM and stream it to the
 * robot. It is deliberately NOT a filesystem path: a path names a file on the
 * cloud's disk, and the robot resolves file playback against its own, so the
 * bytes never reached it and clips silently never played.
 * `clipId: null` marks a clip with no real backing audio (currently
 * recordings, which have no capture pipeline yet) -- visible but unplayable. */
interface Clip {
  id: string
  label: string
  clipId: string | null
}

const NO_FILE_REASON = 'No real audio file for this clip — recording is simulated, so there is nothing to play yet.'

/**
 * Speak, upgraded from a plain fire-and-forget command to a small popover
 * matching the reference app's Play (preset clip) / Shout (hold-to-talk)
 * split (LIVEOPS_AUDIT_TRACKER.md 4.1) — SDK-confirmed as a real distinction,
 * not just reference-app UX: the vendored SDK's VoiceCmd has a genuine
 * `type: "file"` (play a path) vs. `type: "streaming"` (live mic capture)
 * mode.
 *
 * Play only offers clips with a real on-disk `file_path` -- there is no
 * backend-side preset-clip library, so the two former hardcoded presets
 * ("Stand Clear" / "Patrol Greeting") were removed rather than left as
 * buttons that would always fail `dobot_adapter.py::speak`'s
 * `params["file_path"]` lookup against the real pipeline. Uploading a file
 * actually POSTs it to `backend/control/media.py`'s audio-clips endpoint and
 * keeps the real returned path; recording a clip is still a timed/simulated
 * placeholder (no real audio capture pipeline anywhere yet) and is listed
 * but disabled for Play, since it has no real file behind it either.
 *
 * Shout has no real backing at all right now (no streaming/mic-capture
 * pipeline) and is a mock-only affordance -- see CurrentTaskBar's `onShout`
 * wiring, which forces the simulated ack path via `dispatchCommand`'s
 * `forceMock` option rather than sending a real SPEAK with nothing useful in
 * `params`. Shout tab supports a lock toggle: unlocked is hold-to-talk
 * (press and hold, release to send); locked turns it into press-to-start /
 * press-again-to-finish-and-send.
 */
export function SpeakButton({
  availability, robotId, onPlay, onShout,
}: {
  availability: CommandAvailability
  robotId: string
  onPlay: (clip: { label: string; clipId: string; volume: number }) => void
  onShout: () => void
}) {
  const uploadAudioClip = useLiveOpsStore((s) => s.uploadAudioClip)
  const createSpokenClip = useLiveOpsStore((s) => s.createSpokenClip)
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('play')
  const [shouting, setShouting] = useState(false)
  const [locked, setLocked] = useState(false)
  const [clips, setClips] = useState<Clip[]>([])
  const [addingClip, setAddingClip] = useState(false)
  const [recording, setRecording] = useState(false)
  const [recordSeconds, setRecordSeconds] = useState(0)
  // Volume is applied per play (the edge bridge scales the PCM), so it can be
  // changed without re-uploading. 100 = the clip's own recorded level; VoiceCmd
  // has no volume field, so this is the only control available.
  const [volume, setVolume] = useState(100)
  const [sayText, setSayText] = useState('')
  const [speaking, setSpeaking] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  /** Typed text becomes an ordinary clip and plays straight away. Kept in the
   * clip list afterwards so a repeated announcement can be replayed without
   * re-synthesising it -- and the edge device caches it, so a repeat does not
   * even re-cross the network. */
  async function speakTypedText() {
    const text = sayText.trim()
    if (!text || speaking) return
    setSpeaking(true)
    setUploadError(null)
    try {
      const { clip_id } = await createSpokenClip(robotId, text)
      const label = text.length > 28 ? `${text.slice(0, 28)}...` : text
      setClips((c) => [...c, { id: `clip-${Date.now()}`, label, clipId: clip_id }])
      onPlay({ label, clipId: clip_id, volume })
      setSayText('')
      setOpen(false)
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Could not synthesise speech')
    } finally {
      setSpeaking(false)
    }
  }
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

  async function handleFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setUploading(true)
    setUploadError(null)
    try {
      const { clip_id } = await uploadAudioClip(robotId, file)
      setClips((c) => [...c, { id: `clip-${Date.now()}`, label: file.name.replace(/\.[^.]+$/, ''), clipId: clip_id }])
      setAddingClip(false)
    } catch {
      setUploadError('Upload failed — try again.')
    } finally {
      setUploading(false)
    }
  }

  function toggleRecording() {
    if (recording) {
      // No real audio capture pipeline exists yet, so this clip has no
      // backing file -- clipId: null keeps it visible but unplayable
      // (see NO_FILE_REASON) rather than pretending it can be sent for real.
      setClips((c) => [...c, { id: `clip-${Date.now()}`, label: `Recording (${recordSeconds}s)`, clipId: null }])
      setRecording(false)
      setRecordSeconds(0)
      setAddingClip(false)
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
            {(['play', 'say', 'shout'] as Tab[]).map((t) => (
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

          {tab === 'say' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
              <textarea
                value={sayText}
                onChange={(e) => setSayText(e.target.value)}
                onKeyDown={(e) => {
                  // Ctrl/Cmd+Enter sends; a bare Enter inserts a newline, since
                  // announcements are often more than one line.
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault()
                    void speakTypedText()
                  }
                }}
                maxLength={1000}
                rows={3}
                placeholder="Type an announcement…"
                aria-label="Announcement text"
                style={{
                  width: '100%', resize: 'vertical', padding: '6px 8px',
                  background: color.card, border: `1px solid ${color.border}`,
                  borderRadius: radius.sm, color: color.t1,
                  fontSize: font.size.sm, fontFamily: font.family,
                }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Volume2 size={11} strokeWidth={2} color={color.t2} />
                <input
                  type="range" min={0} max={100} step={5} value={volume}
                  aria-label="Announcement volume"
                  onChange={(e) => setVolume(Number(e.target.value))}
                  style={{ flex: 1, accentColor: color.accent, cursor: 'pointer' }}
                />
                <span style={{
                  fontSize: font.size.xs, color: color.t2, minWidth: 30, textAlign: 'right',
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {volume}%
                </span>
              </div>
              <DisabledReasonButton
                enabled={availability.enabled && sayText.trim().length > 0 && !speaking}
                reason={
                  !availability.enabled
                    ? (availability.reason ?? '')
                    : speaking ? 'Synthesising…' : 'Type something to announce'
                }
                onClick={() => void speakTypedText()}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  padding: '6px 8px', borderRadius: radius.sm, width: '100%',
                  background: color.card, border: `1px solid ${color.border}`,
                  color: color.t1, fontSize: font.size.sm, fontFamily: font.family,
                }}
              >
                <PlayIcon size={11} strokeWidth={2} color={color.accent} />
                {speaking ? 'Synthesising…' : 'Announce'}
              </DisabledReasonButton>
              {uploadError && (
                <div style={{ fontSize: font.size.xs, color: color.red }}>{uploadError}</div>
              )}
            </div>
          ) : tab === 'play' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {clips.length === 0 && (
                <div style={{ padding: '6px 8px', fontSize: font.size.xs, color: color.t3 }}>
                  No clips yet — upload an audio file to add one.
                </div>
              )}

              {clips.length > 0 && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '6px 8px', borderBottom: `1px solid ${color.border}`, marginBottom: 2,
                }}>
                  <Volume2 size={11} strokeWidth={2} color={color.t2} />
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={volume}
                    aria-label="Playback volume"
                    onChange={(e) => setVolume(Number(e.target.value))}
                    style={{ flex: 1, accentColor: color.accent, cursor: 'pointer' }}
                  />
                  <span style={{
                    fontSize: font.size.xs, color: color.t2, minWidth: 30, textAlign: 'right',
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    {volume}%
                  </span>
                </div>
              )}
              {clips.map((clip) => (
                <DisabledReasonButton
                  key={clip.id}
                  enabled={clip.clipId !== null}
                  reason={NO_FILE_REASON}
                  onClick={() => {
                    if (!clip.clipId) return
                    onPlay({ label: clip.label, clipId: clip.clipId, volume })
                    setOpen(false)
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderRadius: radius.sm,
                    background: 'transparent', border: 'none', color: color.t1, fontSize: font.size.sm,
                    fontFamily: font.family, textAlign: 'left', width: '100%',
                  }}
                >
                  <PlayIcon size={11} strokeWidth={2} color={color.accent} />
                  {clip.label}
                </DisabledReasonButton>
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
                    disabled={uploading}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderRadius: radius.sm,
                      background: 'rgba(255,255,255,0.05)', border: `1px solid ${color.border}`, color: color.t1,
                      fontSize: font.size.sm, fontFamily: font.family, textAlign: 'left',
                      cursor: uploading ? 'not-allowed' : 'pointer', opacity: uploading ? 0.6 : 1,
                    }}
                  >
                    <Upload size={12} strokeWidth={2} />
                    {uploading ? 'Uploading…' : 'Upload audio file'}
                  </button>
                  {uploadError && (
                    <div style={{ padding: '0 8px', fontSize: font.size.xs, color: color.red }}>{uploadError}</div>
                  )}
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
