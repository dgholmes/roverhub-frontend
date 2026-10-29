import { useEffect, useRef, useState } from 'react'
import { Lock, Mic2, Play as PlayIcon, Plus, Square, Unlock, Upload, Volume2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { color, font, radius, space } from '@/design-system/tokens'
import { DisabledReasonButton } from '@/components/common/DisabledReason'
import { CommandFace, commandButtonStyle } from '../mission/ActionButton'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'
import type { CommandAvailability } from '@/types'
import { useSessionStore } from '@/store/useSessionStore'
import { MAX_RECORDING_MS, MIN_RECORDING_MS, MicError, startMicRecording, type MicRecording } from '@/lib/micRecorder'

type Tab = 'play' | 'say' | 'shout'

/** A Play-tab clip. `clipId` is the backend's clip identifier, which SPEAK
 * carries so the edge bridge can fetch the clip's PCM and stream it to the
 * robot. It is deliberately NOT a filesystem path: a path names a file on the
 * cloud's disk, and the robot resolves file playback against its own, so the
 * bytes never reached it and clips silently never played. */
interface Clip {
  id: string
  label: string
  clipId: string
}

/** What the microphone is being used for: a Shout (sent on release) or a new
 * Play-tab clip (kept, not played). One recorder, so at most one at a time. */
type CapturePurpose = 'shout' | 'clip'

/**
 * Speak, upgraded from a plain fire-and-forget command to a small popover
 * matching the reference app's Play (preset clip) / Shout (hold-to-talk)
 * split (LIVEOPS_AUDIT_TRACKER.md 4.1) — SDK-confirmed as a real distinction,
 * not just reference-app UX: the vendored SDK's VoiceCmd has a genuine
 * `type: "file"` (play a path) vs. `type: "streaming"` (live mic capture)
 * mode.
 *
 * Play only offers clips with real audio behind them -- there is no
 * backend-side preset-clip library. Uploading a file or recording one from the
 * microphone both POST to `backend/control/media.py`'s audio-clips endpoint.
 *
 * Shout is push-to-talk (see micRecorder.ts for why not a live stream): the
 * microphone records while the button is held and the recording plays on the
 * robot when it is released, as an ordinary clip at the session volume. The
 * lock toggle turns hold-to-talk into press-to-start / press-again-to-send.
 * (Until 2026-10-29 Shout was a mock that recorded nothing.)
 *
 * The volume slider also reaches a clip that is already playing, through
 * SET_SPEAK_VOLUME (useLiveOpsStore.setSpeakVolume).
 */
export function SpeakButton({
  availability, stopAvailability, robotId, onPlay, onStop,
}: {
  availability: CommandAvailability
  /** STOP_SPEAK's own availability. It outlives SPEAK's -- the policy allows it
   * through lost gRPC, E-Stop and fault -- so the popover still opens, showing
   * only Stop audio, when nothing new may be played (2026-10-26 audit 4.8). */
  stopAvailability: CommandAvailability
  robotId: string
  onPlay: (clip: { label: string; clipId: string; volume: number }) => void
  /** Cancels whatever the robot is currently saying. */
  onStop: () => void
}) {
  const { t } = useTranslation()
  const uploadAudioClip = useLiveOpsStore((s) => s.uploadAudioClip)
  const createSpokenClip = useLiveOpsStore((s) => s.createSpokenClip)
  const setSpeakVolume = useLiveOpsStore((s) => s.setSpeakVolume)
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('play')
  // Which recording (if any) is running, and whether a finished one is being
  // uploaded. `recordingRef` holds the recorder while it starts and runs, so a
  // release that lands before the browser has granted the mic still ends it.
  const [capturing, setCapturing] = useState<CapturePurpose | null>(null)
  const [sendingCapture, setSendingCapture] = useState(false)
  const [micError, setMicError] = useState<string | null>(null)
  const recordingRef = useRef<Promise<MicRecording> | null>(null)
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const shouting = capturing === 'shout'
  const [locked, setLocked] = useState(false)
  const [clips, setClips] = useState<Clip[]>([])
  const [addingClip, setAddingClip] = useState(false)
  const recording = capturing === 'clip'
  const [recordSeconds, setRecordSeconds] = useState(0)
  // Session state, not local: one volume governs every way of producing audio
  // (stored clip, typed announcement, shout) and survives closing the popover.
  // Applied per play by the edge bridge scaling the PCM, so changing it never
  // requires re-uploading -- VoiceCmd has no volume field.
  const volume = useSessionStore((st) => st.speakVolume)
  const setVolume = useSessionStore((st) => st.setSpeakVolume)
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
      setUploadError(error instanceof Error ? error.message : t('command.speak.synthFailed'))
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
    if (!capturing) return
    setRecordSeconds(0)
    const t = setInterval(() => setRecordSeconds((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [capturing])

  // Closing the popover or leaving the page mid-recording discards it rather
  // than leaving the microphone open.
  useEffect(() => {
    if (!open) abandonCapture()
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => abandonCapture(), []) // eslint-disable-line react-hooks/exhaustive-deps

  function micMessage(error: unknown): string {
    const problem = error instanceof MicError ? error.problem : 'failed'
    return t(`command.speak.mic.${problem}`)
  }

  function beginCapture(purpose: CapturePurpose) {
    if (recordingRef.current || sendingCapture) return
    setMicError(null)
    setUploadError(null)
    setCapturing(purpose)
    const started = startMicRecording()
    recordingRef.current = started
    started.catch((error) => {
      if (recordingRef.current === started) recordingRef.current = null
      setCapturing(null)
      setMicError(micMessage(error))
    })
    autoStopRef.current = setTimeout(() => void finishCapture(purpose), MAX_RECORDING_MS)
  }

  /** Ends the running recording; the audio, or null if there is nothing worth
   * sending (it failed to start, or was a tap rather than speech). */
  async function endCapture(): Promise<Blob | null> {
    const started = recordingRef.current
    recordingRef.current = null
    if (autoStopRef.current) clearTimeout(autoStopRef.current)
    autoStopRef.current = null
    setCapturing(null)
    if (!started) return null
    let handle: MicRecording
    try {
      handle = await started
    } catch {
      return null  // already reported by beginCapture
    }
    const { blob, durationMs } = await handle.stop()
    if (durationMs < MIN_RECORDING_MS) {
      setMicError(t('command.speak.mic.tooShort'))
      return null
    }
    return blob
  }

  function abandonCapture() {
    const started = recordingRef.current
    recordingRef.current = null
    if (autoStopRef.current) clearTimeout(autoStopRef.current)
    autoStopRef.current = null
    setCapturing(null)
    if (started) started.then((handle) => handle.cancel(), () => {})
  }

  async function finishCapture(purpose: CapturePurpose) {
    if (!recordingRef.current) return
    const seconds = recordSeconds
    const blob = await endCapture()
    if (!blob) return
    setSendingCapture(true)
    try {
      const { clip_id } = await uploadAudioClip(robotId, blob)
      if (purpose === 'shout') {
        onPlay({ label: t('command.speak.shoutCommand'), clipId: clip_id, volume })
        setOpen(false)
      } else {
        setClips((c) => [...c, { id: `clip-${Date.now()}`, label: t('command.speak.recordingClip', { seconds: Math.max(1, seconds) }), clipId: clip_id }])
        setAddingClip(false)
      }
    } catch {
      setMicError(t('command.speak.uploadFailed'))
    } finally {
      setSendingCapture(false)
    }
  }

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
      setUploadError(t('command.speak.uploadFailed'))
    } finally {
      setUploading(false)
    }
  }

  function toggleRecording() {
    if (recording) void finishCapture('clip')
    else beginCapture('clip')
  }

  function handleShoutPress() {
    if (!locked) return
    if (shouting) void finishCapture('shout')
    else beginCapture('shout')
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <DisabledReasonButton
        enabled={availability.enabled || stopAvailability.enabled}
        reason={availability.reason}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{ ...commandButtonStyle(), background: open ? color.cardHover : color.card }}
      >
        <CommandFace icon={Mic2} label={t('command.speak.label')} />
      </DisabledReasonButton>

      {open && (
        <div style={{
          position: 'absolute', bottom: 'calc(100% + 8px)', right: 0, width: 220,
          background: color.elevated, border: `1px solid ${color.border}`, borderRadius: radius.lg,
          padding: space[2], zIndex: 50,
        }}>
          {availability.enabled && (<>
          <div style={{ display: 'flex', gap: 2, marginBottom: space[2] }}>
            {(['play', 'say', 'shout'] as Tab[]).map((id) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                style={{
                  flex: 1, padding: '5px 0', borderRadius: radius.sm, fontSize: font.size.sm, fontFamily: font.family,
                  background: tab === id ? color.cardHover : 'transparent',
                  border: `1px solid ${tab === id ? color.borderLt : 'transparent'}`,
                  color: tab === id ? color.t1 : color.t3, fontWeight: tab === id ? font.weight.semibold : font.weight.regular,
                  cursor: 'pointer',
                }}
              >
                {t(`command.speak.tabs.${id}`)}
              </button>
            ))}
          </div>

          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: `0 2px ${space[2]}px`, borderBottom: `1px solid ${color.border}`,
            marginBottom: space[2],
          }}>
            <Volume2 size={11} strokeWidth={2} color={color.t2} />
            <input
              type="range" min={0} max={100} step={5} value={volume}
              aria-label={t('command.speak.volumeAria')}
              onChange={(e) => {
                const next = Number(e.target.value)
                setVolume(next)
                // Reaches the clip playing now, too; a no-op when nothing is.
                setSpeakVolume(robotId, next)
              }}
              style={{ flex: 1, accentColor: color.accent, cursor: 'pointer' }}
            />
            <span style={{
              fontSize: font.size.xs, color: color.t2, minWidth: 30, textAlign: 'right',
              fontVariantNumeric: 'tabular-nums',
            }}>
              {volume}%
            </span>
          </div>
          </>)}

          <button
            onClick={() => { onStop(); setOpen(false) }}
            title={t('command.speak.stopAudioTitle')}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              width: '100%', padding: '5px 8px', marginBottom: space[2],
              borderRadius: radius.sm, background: color.card,
              border: `1px solid ${color.border}`, color: color.t1,
              fontSize: font.size.sm, fontFamily: font.family, cursor: 'pointer',
            }}
          >
            <Square size={10} strokeWidth={2.4} color={color.red} />
            {t('command.speak.stopAudio')}
          </button>

          {!availability.enabled ? (
            <div style={{ padding: '0 2px', fontSize: font.size.xs, color: color.t3 }}>
              {availability.reason}
            </div>
          ) : tab === 'say' ? (
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
                placeholder={t('command.speak.placeholder')}
                aria-label={t('command.speak.textAria')}
                style={{
                  width: '100%', resize: 'vertical', padding: '6px 8px',
                  background: color.card, border: `1px solid ${color.border}`,
                  borderRadius: radius.sm, color: color.t1,
                  fontSize: font.size.sm, fontFamily: font.family,
                }}
              />
              <DisabledReasonButton
                enabled={availability.enabled && sayText.trim().length > 0 && !speaking}
                reason={
                  !availability.enabled
                    ? (availability.reason ?? '')
                    : speaking ? t('command.speak.synthesising') : t('command.speak.typeSomething')
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
                {speaking ? t('command.speak.synthesising') : t('command.speak.announce')}
              </DisabledReasonButton>
              {uploadError && (
                <div style={{ fontSize: font.size.xs, color: color.red }}>{uploadError}</div>
              )}
            </div>
          ) : tab === 'play' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {clips.length === 0 && (
                <div style={{ padding: '6px 8px', fontSize: font.size.xs, color: color.t3 }}>
                  {t('command.speak.noClips')}
                </div>
              )}

              {clips.map((clip) => (
                <button
                  key={clip.id}
                  onClick={() => {
                    onPlay({ label: clip.label, clipId: clip.clipId, volume })
                    setOpen(false)
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderRadius: radius.sm,
                    background: 'transparent', border: 'none', color: color.t1, fontSize: font.size.sm,
                    fontFamily: font.family, textAlign: 'left', width: '100%', cursor: 'pointer',
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
                  {t('command.speak.addClip')}
                </button>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <input ref={fileInputRef} type="file" accept="audio/*" onChange={handleFileChosen} style={{ display: 'none' }} />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderRadius: radius.sm,
                      background: color.hover, border: `1px solid ${color.border}`, color: color.t1,
                      fontSize: font.size.sm, fontFamily: font.family, textAlign: 'left',
                      cursor: uploading ? 'not-allowed' : 'pointer', opacity: uploading ? 0.6 : 1,
                    }}
                  >
                    <Upload size={12} strokeWidth={2} />
                    {uploading ? t('command.speak.uploading') : t('command.speak.uploadFile')}
                  </button>
                  {uploadError && (
                    <div style={{ padding: '0 8px', fontSize: font.size.xs, color: color.red }}>{uploadError}</div>
                  )}
                  <button
                    onClick={toggleRecording}
                    disabled={sendingCapture || shouting}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderRadius: radius.sm,
                      background: recording ? color.redBg : color.hover,
                      border: `1px solid ${recording ? color.redBorder : color.border}`,
                      color: recording ? color.red : color.t1,
                      fontSize: font.size.sm, fontFamily: font.family, cursor: 'pointer', textAlign: 'left',
                    }}
                  >
                    {recording ? <Square size={11} strokeWidth={2} /> : <Mic2 size={12} strokeWidth={2} />}
                    {recording
                      ? t('command.speak.recordingProgress', { seconds: recordSeconds })
                      : sendingCapture ? t('command.speak.uploading') : t('command.speak.recordNew')}
                  </button>
                  {micError && (
                    <div style={{ padding: '0 8px', fontSize: font.size.xs, color: color.red }}>{micError}</div>
                  )}
                  {!recording && (
                    <button
                      onClick={() => setAddingClip(false)}
                      style={{
                        padding: '3px 0', border: 'none', background: 'transparent', color: color.t3,
                        fontSize: font.size.xs, fontFamily: font.family, cursor: 'pointer',
                      }}
                    >
                      {t('common.cancel')}
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <button
                // Pointer events rather than mouse events so hold-to-talk also
                // works on a touchscreen. Sliding off the button sends what was
                // said, as releasing would -- dropping it would lose speech the
                // operator meant to send.
                onPointerDown={() => !locked && beginCapture('shout')}
                onPointerUp={() => { if (!locked) void finishCapture('shout') }}
                onPointerLeave={() => { if (!locked && shouting) void finishCapture('shout') }}
                onClick={handleShoutPress}
                disabled={sendingCapture || recording}
                style={{
                  width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                  padding: '12px 8px', borderRadius: radius.sm, fontFamily: font.family,
                  background: shouting ? color.redBg : color.hover,
                  border: `1px solid ${shouting ? color.redBorder : color.border}`,
                  color: shouting ? color.red : color.t1, cursor: 'pointer',
                }}
              >
                <Mic2 size={18} strokeWidth={1.8} />
                <span style={{ fontSize: font.size.xs, fontWeight: font.weight.semibold }}>
                  {sendingCapture
                    ? t('command.speak.sendingShout')
                    : shouting
                      ? `${locked ? t('command.speak.speakingLocked') : t('command.speak.speaking')} ${recordSeconds}s`
                      : locked ? t('command.speak.clickToStart') : t('command.speak.holdToTalk')}
                </span>
              </button>
              {micError && (
                <div style={{ fontSize: font.size.xs, color: color.red }}>{micError}</div>
              )}

              <button
                onClick={() => setLocked((l) => !l)}
                disabled={shouting}
                title={locked ? t('command.speak.lockedTitle') : t('command.speak.unlockedTitle')}
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
                {locked ? t('command.speak.locked') : t('command.speak.holdToTalkMode')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
