import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Save, Trash2 } from 'lucide-react'
import { Button } from '@/components/kit'
import { color, font, radius, space } from '@/design-system/tokens'
import { stopSurvey } from '@/survey/surveyCommands'
import { useCan } from '@/org/useCan'

type Asking = null | 'save' | 'discard'

/**
 * Stop & save and Discard, each confirmed in place rather than in a dialog:
 * the question replaces the two buttons, so the map and the drive bar stay in
 * view while the operator decides. Saving and discarding both end the
 * recording; only discarding loses it, so that one is the red one.
 *
 * `compact` is the LiveOps banner's form: Stop & save only, smaller.
 * Shown only to holders of `configure` (the Engineer role), which the backend
 * requires for STOP_SURVEY; everyone else watches.
 */
export function SurveyStopControls({ robotId, surveyId, compact = false, disabled = false }: {
  robotId: string
  surveyId: string
  compact?: boolean
  disabled?: boolean
}) {
  const { t } = useTranslation()
  const [asking, setAsking] = useState<Asking>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const size = compact ? 'sm' : 'md'
  // STOP_SURVEY needs `configure` on the backend: without it the survey is watched, not run.
  const canConfigure = useCan('configure')
  if (!canConfigure) return null

  const stop = async (save: boolean) => {
    setBusy(true)
    setError(null)
    const result = await stopSurvey(robotId, { survey_id: surveyId, save })
    setBusy(false)
    if (result.ok) setAsking(null)
    else setError(result.error)
  }

  if (asking) {
    const save = asking === 'save'
    return (
      <div
        role="group" aria-label={save ? t('survey.live.confirmSave') : t('survey.live.confirmDiscard')}
        style={{
          display: 'grid', gap: space[2], padding: compact ? `${space[1]}px ${space[2]}px` : space[3],
          borderRadius: radius.md, background: save ? color.accentDim : color.redBg,
        }}
      >
        <span style={{ fontSize: compact ? font.size.sm : font.size.md, fontWeight: font.weight.semibold, color: color.t1 }}>
          {save ? t('survey.live.confirmSave') : t('survey.live.confirmDiscard')}
        </span>
        {!compact && (
          <span style={{ fontSize: font.size.sm, color: color.t2, lineHeight: 1.5 }}>
            {save ? t('survey.live.confirmSaveBody') : t('survey.live.confirmDiscardBody')}
          </span>
        )}
        <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
          <Button size={size} variant={save ? 'primary' : 'danger'} disabled={busy} onClick={() => void stop(save)}>
            {save ? t('survey.live.saveNow') : t('survey.live.discardNow')}
          </Button>
          <Button size={size} disabled={busy} onClick={() => { setAsking(null); setError(null) }}>{t('survey.live.keepSurveying')}</Button>
        </div>
        {error && <span role="alert" style={{ fontSize: font.size.sm, color: color.red }}>{error}</span>}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', alignItems: 'center' }}>
      <Button size={size} variant="primary" icon={Save} disabled={disabled} onClick={() => setAsking('save')}>
        {t('survey.live.stopSave')}
      </Button>
      {!compact && (
        <Button size={size} icon={Trash2} disabled={disabled} onClick={() => setAsking('discard')}>
          {t('survey.live.discard')}
        </Button>
      )}
    </div>
  )
}
