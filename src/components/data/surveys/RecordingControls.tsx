import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Hammer, Pin, PinOff, RotateCcw, Trash2 } from 'lucide-react'
import { hashForMapsSurvey } from '@/app/routes'
import { Button } from '@/components/kit'
import { answersMapReady, useMounted } from '@/components/survey/SurveyActions'
import { formatSize } from '@/data/runTimeline'
import { color, font, radius, space } from '@/design-system/tokens'
import { useAuthStore } from '@/lib/auth/authStore'
import { useCan } from '@/org/useCan'
import { deleteSurveyRecording, reprocessSurvey, setSurveyKeep } from '@/survey/surveyCommands'
import type { RobotState } from '@/types'
import type { SurveyRecord } from '@/types/surveyReplay'

type Survey = Pick<SurveyRecord, 'survey_id' | 'name' | 'robot_id' | 'map_id' | 'floor_index'>

type Ask = 'reprocess' | 'rebuild' | 'delete'
type Note = { tone: 'ok' | 'busy' | 'error'; text: string } | null

/**
 * A survey's recording on the robot (map ready spec 4.2, 4.3), for Data ›
 * Surveys' rows and the survey's page: its size on the robot, Keep (out of the
 * robot's retention), Process again and Rebuild from recording (the processing
 * after Stop & save, run again; the rebuild re-runs the map from the bag and
 * checks it against the legs first), and Delete recording.
 *
 * Read from the robot's own list (its 0.0.29 registration), which is fresher
 * than the cloud's `recording_kept`. Every button needs `configure`; Delete
 * also needs the survey's name typed, says it cannot be undone, and that the
 * map in the cloud stays.
 */
export function RecordingControls({ survey, robot, siteId, detailed = false }: {
  survey: Survey
  robot: RobotState | undefined
  siteId: string
  /** The survey's page: also says why nothing is offered. */
  detailed?: boolean
}) {
  const { t } = useTranslation()
  const canConfigure = useCan('configure')
  const canSwitchOn = useAuthStore((s) => s.status === 'signedIn' && s.user?.can_use_engineer_tools === true)
  const mounted = useMounted()
  const [ask, setAsk] = useState<Ask | null>(null)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<Note>(null)
  const small: React.CSSProperties = { margin: 0, fontSize: font.size.sm, color: color.t3, lineHeight: 1.5 }

  if (!robot || !answersMapReady(robot)) {
    return detailed && robot ? <p style={small}>{t('survey.recording.oldBridge', { robot: robot.name })}</p> : null
  }
  const rec = robot.bridge?.recordings?.find((r) => r.survey_id === survey.survey_id)
  if (!rec) return <p data-recording="gone" style={small}>{t('survey.recording.notOnRobot', { robot: robot.name })}</p>

  const finish = (n: Note) => { if (mounted.current) { setBusy(false); setNote(n) } }
  const keep = async () => {
    setBusy(true)
    setNote(null)
    const r = await setSurveyKeep(robot.robot_id, { survey_id: survey.survey_id, keep: !rec.keep })
    finish(r.ok ? null : { tone: 'error', text: t('survey.recording.failed', { error: r.error ?? '' }) })
  }
  const reprocess = async (rebuild: boolean) => {
    setAsk(null)
    setBusy(true)
    // The ack comes when the processing ends, up to an hour later; its progress is on the Survey page.
    setNote({ tone: 'busy', text: t('survey.recording.processing') })
    const r = await reprocessSurvey(robot.robot_id, {
      survey_id: survey.survey_id, map_id: survey.map_id, floor_index: survey.floor_index, rebuild,
    })
    finish(r.ok ? { tone: 'ok', text: t('survey.recording.processed') } : { tone: 'error', text: t('survey.recording.failed', { error: r.error ?? '' }) })
  }
  const remove = async () => {
    setAsk(null)
    setTyped('')
    setBusy(true)
    setNote(null)
    const r = await deleteSurveyRecording(robot.robot_id, { survey_id: survey.survey_id })
    finish(r.ok
      ? { tone: 'ok', text: t('survey.recording.deleted', { size: formatSize(r.bytesFreed ?? 0) }) }
      : { tone: 'error', text: t('survey.recording.failed', { error: r.error ?? '' }) })
  }

  const canRerun = rec.has_bag && !rec.processing && !busy
  const canDelete = (rec.has_bag || rec.has_cameras) && !rec.processing && !busy
  const target = survey.map_id ? t('survey.recording.itsMap') : t('survey.recording.newMap')
  const nameMatches = typed.trim() === survey.name.trim()

  return (
    <div data-recording={survey.survey_id} style={{ display: 'grid', gap: space[2] }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
        <span style={{ fontSize: font.size.sm, color: color.t2, fontVariantNumeric: 'tabular-nums' }}>
          {t('survey.recording.size', { size: formatSize(rec.bytes), robot: robot.name })}
          {!rec.has_bag && ` · ${t('survey.recording.noBag')}`}
          {rec.keep && ` · ${t('survey.recording.kept')}`}
          {rec.processing && ` · ${t('survey.recording.busy')}`}
        </span>
        <span style={{ flex: 1 }} />
        {canConfigure && (
          <>
            <Button size="sm" icon={rec.keep ? PinOff : Pin} aria-pressed={rec.keep} disabled={busy}
              title={t('survey.recording.keepHint')} onClick={() => void keep()}>
              {rec.keep ? t('survey.recording.unkeep') : t('survey.recording.keep')}
            </Button>
            {rec.has_bag && (
              <>
                <Button size="sm" icon={RotateCcw} disabled={!canRerun} onClick={() => setAsk('reprocess')}>{t('survey.recording.reprocess')}</Button>
                <Button size="sm" icon={Hammer} disabled={!canRerun} onClick={() => setAsk('rebuild')}>{t('survey.recording.rebuild')}</Button>
              </>
            )}
            {(rec.has_bag || rec.has_cameras) && (
              <Button size="sm" variant="danger" icon={Trash2} disabled={!canDelete} onClick={() => { setTyped(''); setAsk('delete') }}>
                {t('survey.recording.delete')}
              </Button>
            )}
          </>
        )}
      </div>
      {!canConfigure && (
        <p style={small}>{t(canSwitchOn ? 'survey.recording.needsEngineerTools' : 'survey.recording.needsEngineer')}</p>
      )}
      {(ask === 'reprocess' || ask === 'rebuild') && (
        <div role="alertdialog" aria-label={t(`survey.recording.${ask}`)} style={panel(color.amberBg)}>
          <p style={{ ...small, color: color.t1 }}>
            {t(ask === 'rebuild' ? 'survey.recording.rebuildConfirm' : 'survey.recording.reprocessConfirm', { name: survey.name, target })}
          </p>
          <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
            <Button size="sm" variant="primary" onClick={() => void reprocess(ask === 'rebuild')}>{t(`survey.recording.${ask}`)}</Button>
            <Button size="sm" onClick={() => setAsk(null)}>{t('survey.recording.cancel')}</Button>
          </div>
        </div>
      )}
      {ask === 'delete' && (
        <form role="alertdialog" aria-label={t('survey.recording.delete')} style={panel(color.redBg)}
          onSubmit={(e) => { e.preventDefault(); if (nameMatches) void remove() }}>
          <p style={{ ...small, color: color.t1 }}>{t('survey.recording.deleteConfirm', { name: survey.name, robot: robot.name })}</p>
          <label style={{ display: 'grid', gap: space[1] }}>
            <span style={{ fontSize: font.size.sm, color: color.t2 }}>{t('survey.recording.typeName', { name: survey.name })}</span>
            <input
              name="confirm-name" value={typed} autoComplete="off" onChange={(e) => setTyped(e.target.value)}
              style={{ border: 'none', borderRadius: radius.sm, padding: '6px 10px', background: color.card, color: color.t1, fontFamily: font.family, fontSize: font.size.sm }}
            />
          </label>
          <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
            <Button size="sm" type="submit" variant="danger" icon={Trash2} disabled={!nameMatches}>{t('survey.recording.deleteGo')}</Button>
            <Button size="sm" onClick={() => setAsk(null)}>{t('survey.recording.cancel')}</Button>
          </div>
        </form>
      )}
      {note && (
        <p role={note.tone === 'error' ? 'alert' : 'status'} style={{ ...small, color: note.tone === 'error' ? color.red : color.t2 }}>
          {note.text}
          {note.tone === 'busy' && (
            <> <a href={hashForMapsSurvey(siteId, robot.robot_id)} style={{ color: color.accent }}>{t('survey.recording.follow')}</a></>
          )}
        </p>
      )}
    </div>
  )
}

const panel = (background: string): React.CSSProperties => ({
  display: 'grid', gap: space[2], padding: space[3], borderRadius: radius.md, background, maxWidth: 560,
})
