import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Ban, Check, CircleHelp, ExternalLink, Loader2, Minus, TriangleAlert, X } from 'lucide-react'
import { color, font, radius, space } from '@/design-system/tokens'
import { hashForSiteRun } from '@/app/routes'
import type { LogLine } from '@/missions/program/runLog'
import type { ProgramRun } from '@/missions/program/useProgramRun'
import { dryWarningText, reasonText, secondsText } from './runText'

const RESULT_ICON: Record<LogLine['result'], { icon: React.ElementType; tint: string }> = {
  running: { icon: Loader2, tint: color.accent },
  done: { icon: Check, tint: color.green },
  failed: { icon: X, tint: color.red },
  cancelled: { icon: Ban, tint: color.red },
  unknown: { icon: CircleHelp, tint: color.amber },
  skipped: { icon: Minus, tint: color.t3 },
  warning: { icon: TriangleAlert, tint: color.amber },
}

const clock = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function Note({ tone, children }: { tone: 'amber' | 'neutral'; children: React.ReactNode }) {
  return (
    <div style={{
      padding: `${space[2]}px ${space[3]}px`, borderRadius: radius.sm, fontSize: font.size.sm, lineHeight: 1.4,
      background: tone === 'amber' ? color.amberBg : color.card, color: tone === 'amber' ? color.t1 : color.t2,
    }}>
      {children}
    </div>
  )
}

/**
 * The Program tab's run log, beside the canvas: each step with its time,
 * label and result, the dry run's estimate, and after a real run a link to
 * its record in Data › Missions. The log stays after the run ends.
 */
export function RunLog({ run, siteId, detached }: { run: ProgramRun; siteId: string; detached: number }) {
  const { t } = useTranslation()
  const listRef = useRef<HTMLOListElement>(null)
  const { lines, shows, dry, outcome, runId, recordFailed, state } = run

  // Follow the newest step while running.
  useEffect(() => {
    const el = listRef.current
    if (el && state !== 'idle') el.scrollTop = el.scrollHeight
  }, [lines.length, state])

  const base = shows === 'run' ? lines.find((l) => l.blockId)?.at ?? 0 : 0

  return (
    <aside
      aria-label={t('missions.program.run.log.title')}
      style={{ width: 300, flexShrink: 0, display: 'flex', flexDirection: 'column', minHeight: 0, background: color.surface }}
    >
      <div style={{ padding: `${space[3]}px ${space[3]}px ${space[2]}px`, fontSize: font.size.md, fontWeight: font.weight.semibold, color: color.t1 }}>
        {shows === 'dry' ? t('missions.program.run.log.dryTitle') : t('missions.program.run.log.title')}
      </div>

      <div style={{ display: 'grid', gap: space[2], padding: `0 ${space[3]}px` }}>
        {detached > 0 && <Note tone="amber">{t('missions.program.run.log.detached', { count: detached })}</Note>}
        {shows === 'dry' && dry && (
          <>
            <div style={{ fontSize: font.size.md, color: color.t1, fontVariantNumeric: 'tabular-nums' }}>
              {t('missions.program.run.log.drySummary', {
                metres: Math.round(dry.metresWalked * 10) / 10, time: secondsText(t, dry.seconds), count: dry.commands,
              })}
            </div>
            {dry.warnings.map((w) => <Note key={`${w.code}-${w.label ?? ''}`} tone="amber">{dryWarningText(t, w)}</Note>)}
            <Note tone="neutral">{t('missions.program.run.log.dryNote')}</Note>
          </>
        )}
        {recordFailed && <Note tone="amber">{t('missions.program.run.log.recordFailed')}</Note>}
      </div>

      {lines.length === 0 && !shows ? (
        <div style={{ padding: space[3], fontSize: font.size.sm, color: color.t3, lineHeight: 1.5 }}>{t('missions.program.run.log.empty')}</div>
      ) : (
        <ol ref={listRef} style={{ listStyle: 'none', margin: 0, padding: `${space[2]}px ${space[2]}px`, overflowY: 'auto', flex: 1, minHeight: 0 }}>
          {lines.map((l) => {
            const { icon: Icon, tint } = RESULT_ICON[l.result]
            // A warning row without a label is the run record failing to save.
            const label = l.result === 'warning' && !l.label ? t('missions.program.run.log.recordFailed') : l.label
            return (
              <li
                key={l.key}
                style={{
                  display: 'grid', gridTemplateColumns: '40px 16px 1fr', gap: space[2], alignItems: 'start',
                  padding: `${space[1] + 2}px ${space[2]}px`, borderRadius: radius.sm,
                  background: l.result === 'running' ? color.accentDim : 'transparent',
                }}
              >
                <span style={{ fontSize: font.size.xs, color: color.t3, fontVariantNumeric: 'tabular-nums', paddingTop: 2 }}>
                  {shows === 'dry' ? '≈' : ''}{clock(l.at - base)}
                </span>
                <Icon
                  size={14} strokeWidth={2} role="img" aria-label={t(`missions.program.run.result.${l.result}`)}
                  className={l.result === 'running' ? 'rh-spin' : undefined}
                  style={{ color: tint, marginTop: 2 }}
                />
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: font.size.sm, color: l.result === 'skipped' ? color.t3 : color.t1, overflowWrap: 'anywhere' }}>{label}</span>
                  {l.reason && <span style={{ display: 'block', fontSize: font.size.xs, color: color.t2 }}>{reasonText(t, l.reason)}</span>}
                </span>
              </li>
            )
          })}
        </ol>
      )}

      {shows === 'run' && outcome && runId && !recordFailed && (
        <div style={{ padding: space[3] }}>
          <a
            href={hashForSiteRun(siteId, runId)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: space[1], fontSize: font.size.sm, color: color.accent, textDecoration: 'none' }}
          >
            <ExternalLink size={14} aria-hidden /> {t('missions.program.run.log.viewRun')}
          </a>
        </div>
      )}
    </aside>
  )
}
