import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Mic, Square, Upload } from 'lucide-react'
import { color, font, radius, space } from '@/design-system/tokens'
import { Button, Segmented } from '@/components/kit'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'
import { loadClips, saveClip, type SavedClip } from '@/missions/clipLibrary'
import { inputStyle } from './parts'
import { acceptGrantedStream, releaseRecorder, shouldFinishRecording } from './recorderCleanup'

type Tab = 'type' | 'record' | 'upload' | 'saved'
export interface ClipValue { clip_id: string | null; text: string | null }

/**
 * Makes or picks the clip an announcement plays. Every route ends in the
 * backend's clip store, the same one LiveOps' Speak uses, so a mission
 * announcement and a live one play the same way.
 */
export function ClipMaker({ siteId, ownerId, value, onChange }: {
  siteId: string
  ownerId: string
  value: ClipValue
  onChange: (v: { clip_id: string; text: string | null; label: string }) => void
}) {
  const { t } = useTranslation()
  const uploadAudioClip = useLiveOpsStore((s) => s.uploadAudioClip)
  const createSpokenClip = useLiveOpsStore((s) => s.createSpokenClip)
  const [tab, setTab] = useState<Tab>('type')
  const [text, setText] = useState(value.text ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<SavedClip[]>(() => loadClips(siteId))
  const [recording, setRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const secondsRef = useRef(0)
  const recorder = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const micStream = useRef<MediaStream | null>(null)
  const mounted = useRef(true)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => { secondsRef.current = seconds }, [seconds])
  // Task rows collapse, which unmounts this: release the microphone then.
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      releaseRecorder(recorder.current, micStream.current)
      recorder.current = null
      micStream.current = null
    }
  }, [])
  useEffect(() => {
    if (!recording) return
    const id = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [recording])

  function done(clip_id: string, label: string, said: string | null) {
    if (!mounted.current) return // finished after the row collapsed: nobody to tell, and the actions closure is stale
    setSaved(saveClip(siteId, { clip_id, label, text: said, created_at: new Date().toISOString() }))
    onChange({ clip_id, text: said, label })
  }

  async function run(work: () => Promise<void>) {
    setBusy(true); setError(null)
    try { await work() } catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : String(e)) } finally { if (mounted.current) setBusy(false) }
  }

  const speak = () => run(async () => {
    const said = text.trim()
    if (!said) return
    const { clip_id } = await createSpokenClip(ownerId, said)
    done(clip_id, said.length > 40 ? `${said.slice(0, 40)}…` : said, said)
  })

  async function toggleRecord() {
    if (recording) { recorder.current?.stop(); return }
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (!acceptGrantedStream(mounted.current, stream)) return
      micStream.current = stream
      const rec = new MediaRecorder(stream)
      chunks.current = []
      rec.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data) }
      rec.onstop = () => {
        stream.getTracks().forEach((tr) => tr.stop())
        if (!shouldFinishRecording(mounted.current)) return
        setRecording(false)
        const blob = new Blob(chunks.current, { type: rec.mimeType || 'audio/webm' })
        const label = t('missions.clip.recordingLabel', { seconds: secondsRef.current })
        void run(async () => { const { clip_id } = await uploadAudioClip(ownerId, blob); done(clip_id, label, null) })
      }
      recorder.current = rec
      setSeconds(0)
      rec.start()
      setRecording(true)
    } catch {
      setError(t('missions.clip.micDenied'))
    }
  }

  const upload = (file: File) => run(async () => {
    const { clip_id } = await uploadAudioClip(ownerId, file)
    done(clip_id, file.name.replace(/\.[^.]+$/, ''), null)
  })

  return (
    <div style={{ display: 'grid', gap: space[2] }}>
      <Segmented<Tab>
        label={t('missions.clip.source')} value={tab} onChange={setTab}
        options={(['type', 'record', 'upload', 'saved'] as const).map((k) => ({ value: k, label: t(`missions.clip.tab.${k}`) }))}
      />
      {tab === 'type' && (
        <div style={{ display: 'grid', gap: space[2] }}>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={500}
            placeholder={t('missions.clip.typePlaceholder')} style={{ ...inputStyle, height: 'auto', padding: 8, resize: 'vertical' }} />
          <Button size="sm" variant="primary" disabled={busy || !text.trim()} onClick={speak}>{busy ? t('missions.clip.making') : t('missions.clip.makeSpoken')}</Button>
        </div>
      )}
      {tab === 'record' && (
        <Button size="sm" variant={recording ? 'danger' : 'primary'} icon={recording ? Square : Mic} disabled={busy} onClick={toggleRecord}>
          {recording ? t('missions.clip.stop', { seconds }) : t('missions.clip.record')}
        </Button>
      )}
      {tab === 'upload' && (
        <>
          <input ref={fileInput} type="file" accept="audio/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void upload(f) }} />
          <Button size="sm" icon={Upload} disabled={busy} onClick={() => fileInput.current?.click()}>{t('missions.clip.chooseFile')}</Button>
        </>
      )}
      {tab === 'saved' && (
        saved.length === 0
          ? <span style={{ fontSize: font.size.sm, color: color.t3 }}>{t('missions.clip.noneSaved')}</span>
          : <div style={{ display: 'grid', gap: 2, maxHeight: 160, overflowY: 'auto' }}>
              {saved.map((c) => (
                <button key={c.clip_id} type="button" onClick={() => onChange({ clip_id: c.clip_id, text: c.text, label: c.label })}
                  style={{ textAlign: 'left', padding: `${space[1]}px ${space[2]}px`, borderRadius: radius.sm, border: 'none', cursor: 'pointer',
                    background: c.clip_id === value.clip_id ? color.selected : 'transparent', color: color.t1, fontFamily: font.family, fontSize: font.size.sm }}>
                  {c.label}
                </button>
              ))}
            </div>
      )}
      {value.clip_id && (
        <span style={{ display: 'flex', gap: space[1], alignItems: 'center', fontSize: font.size.sm, color: color.green }}>
          <Check size={13} aria-hidden /> {value.text ?? t('missions.clip.ready')}
        </span>
      )}
      {error && <span style={{ fontSize: font.size.sm, color: color.red }}>{error}</span>}
    </div>
  )
}
