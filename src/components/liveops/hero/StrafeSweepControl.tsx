import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, InlineAlertDialog } from '@/components/kit'
import { color, font, radius, space } from '@/design-system/tokens'
import {
  clockTime,
  STRAFE_SWEEP_SPEED_RATIO,
  STRAFE_SWEEP_STEPS,
  STRAFE_SWEEP_TOTAL_MS,
} from '@/liveops/strafeSweep'
import type { StrafeSweep } from '@/liveops/useStrafeSweep'

/**
 * The manual-control pad's "Measure sideways" row: asks in place, then shows
 * the running step with a Stop, then the start and end clock times so the run
 * can be found in the recording. ManualControlOverlay owns the sweep (it has
 * to, to keep its own drive loop and keys out of the way) and shows this only
 * while the operator holds control of a quad.
 */
export function StrafeSweepControl({ sweep, onStart }: { sweep: StrafeSweep; onStart: () => void }) {
  const { t } = useTranslation()
  const [asking, setAsking] = useState(false)
  const openRef = useRef<HTMLButtonElement>(null)
  const stopRef = useRef<HTMLButtonElement>(null)
  const askTextId = useId()
  const { state } = sweep
  const running = state.phase === 'running'

  // Start removes the button that had focus: give it to Stop.
  useEffect(() => {
    if (running) stopRef.current?.focus({ preventScroll: true })
  }, [running])

  const row: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap', fontSize: font.size.sm,
  }
  const muted: React.CSSProperties = { color: color.t3, fontVariantNumeric: 'tabular-nums' }

  if (state.phase === 'running') {
    const seconds = state.secondsLeft.toFixed(1)
    const text = state.kind === 'hold'
      ? t('liveops.manual.sweep.hold', {
          side: t(state.side === 'left' ? 'liveops.manual.sweep.left' : 'liveops.manual.sweep.right'),
          stick: state.stick.toFixed(1), seconds,
        })
      : t('liveops.manual.sweep.rest', { seconds })
    return (
      <div style={row} data-strafe-sweep="running">
        <span style={{ color: color.blue, fontWeight: font.weight.semibold, fontVariantNumeric: 'tabular-nums' }}>{text}</span>
        <span style={muted}>
          {t('liveops.manual.sweep.progress', { n: state.stepIndex + 1, total: STRAFE_SWEEP_STEPS.length })}
          {' · '}{t('liveops.manual.sweep.keysStop')}
        </span>
        <Button ref={stopRef} variant="danger" style={{ marginLeft: 'auto' }} onClick={() => sweep.stop('operator')}>
          {t('liveops.manual.sweep.stop')}
        </Button>
      </div>
    )
  }

  if (state.phase === 'done' || state.phase === 'stopped') {
    return (
      <div style={row} data-strafe-sweep={state.phase}>
        <span role="status" style={{ color: state.phase === 'done' ? color.t1 : color.amber, fontWeight: font.weight.medium }}>
          {state.phase === 'done'
            ? t('liveops.manual.sweep.done')
            : t('liveops.manual.sweep.stopped', { reason: t(`liveops.manual.sweep.reason.${state.reason}`) })}
        </span>
        <span style={muted}>
          {t('liveops.manual.sweep.times', { start: clockTime(new Date(state.startedAt)), end: clockTime(new Date(state.endedAt)) })}
        </span>
        <Button size="sm" variant="ghost" style={{ marginLeft: 'auto' }} onClick={() => sweep.reset()}>
          {t('liveops.manual.sweep.dismiss')}
        </Button>
      </div>
    )
  }

  if (asking) {
    return (
      <InlineAlertDialog
        label={t('liveops.manual.sweep.title')} describedBy={askTextId} returnFocus={openRef}
        onClose={() => setAsking(false)}
        style={{ display: 'grid', gap: space[2], padding: space[3], borderRadius: radius.md, background: color.amberBg, maxWidth: 420 }}
      >
        <p id={askTextId} style={{ margin: 0, fontSize: font.size.sm, color: color.t1, lineHeight: 1.5 }}>
          {t('liveops.manual.sweep.confirm', {
            // "about 30 s": the 28 s schedule, rounded as people say it.
            seconds: Math.round(STRAFE_SWEEP_TOTAL_MS / 10_000) * 10, pct: STRAFE_SWEEP_SPEED_RATIO,
          })}
        </p>
        <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
          <Button size="sm" variant="primary" onClick={() => { setAsking(false); onStart() }}>
            {t('liveops.manual.sweep.start')}
          </Button>
          <Button size="sm" data-autofocus onClick={() => setAsking(false)}>{t('liveops.manual.sweep.cancel')}</Button>
        </div>
      </InlineAlertDialog>
    )
  }

  return (
    <div style={row}>
      <Button ref={openRef} size="sm" variant="ghost" onClick={() => setAsking(true)}>
        {t('liveops.manual.sweep.open')}
      </Button>
    </div>
  )
}
