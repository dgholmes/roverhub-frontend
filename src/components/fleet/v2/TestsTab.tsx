import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { formatLocale } from '@/i18n'
import { ShieldAlert, ShieldCheck } from 'lucide-react'
import { color, font, radius, space } from '@/design-system/tokens'
import { Badge, Button } from '@/components/kit'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'
import { EStopButton } from '@/components/liveops/command/EStopButton'
import { getCommandAvailability } from '@/liveops/commandPolicy'
import type { Command, CommandType, RobotState } from '@/types'
import { MovementDiagnosticsSection } from '../diagnostics/MovementDiagnosticsSection'
import { BalanceDiagnosticsSection } from '../diagnostics/BalanceDiagnosticsSection'
import { Muted, Section } from './parts'

/** The commands this tab can send, for its result list. */
const TEST_COMMANDS = new Set<CommandType>([
  'LINE_WALK', 'ROTATE', 'CIRCLE', 'SET_SPEED_RATIO', 'CHANGE_MODE', 'SET_STATE',
  'BALANCE_AXIS', 'BALANCE_NEUTRAL', 'BALANCE_SEQUENCE', 'DYNAMIC_POSE', 'STATIC_POSE',
  'ESTOP', 'RESET_ESTOP',
])

/** One tile per test, as many columns as fit. */
const TILE_GRID: React.CSSProperties = {
  display: 'grid', gap: space[3], alignItems: 'start',
  gridTemplateColumns: 'repeat(auto-fill, minmax(min(280px, 100%), 1fr))',
}

/** Tests disarm themselves after this long without a test command. */
const ARM_TIMEOUT_MS = 10 * 60_000

function outcome(t: TFunction, c: Command): { tone: 'green' | 'red' | 'amber' | 'neutral'; text: string } {
  switch (c.current_stage) {
    case 'execution_completed': return { tone: 'green', text: t('fleetDetail.tests.outcomeDone') }
    case 'execution_failed': return { tone: 'red', text: c.failure_reason ? t('fleetDetail.tests.outcomeFailedReason', { reason: c.failure_reason }) : t('fleetDetail.tests.outcomeFailed') }
    case 'timed_out': return { tone: 'red', text: t('fleetDetail.tests.outcomeTimedOut') }
    case 'cancelled': return { tone: 'amber', text: t('fleetDetail.tests.outcomeStopped') }
    default: return { tone: 'neutral', text: t('fleetDetail.tests.outcomeRunning') }
  }
}

/**
 * Engineering motion tests (line walk, rotate, circle, balance and poses).
 * They move the real robot from a page with no camera, so they are locked
 * until someone confirms the area is clear, and they lock again when the
 * robot changes or after ten idle minutes.
 *
 * The E-Stop lives here, and only here in Fleet: this is the one tab that
 * moves the robot. Its bar is sticky, so it stays in reach however far down
 * the test grid the operator has scrolled.
 */
export function TestsTab({ robot }: { robot: RobotState }) {
  const { t } = useTranslation()
  const [armedAt, setArmedAt] = useState<number | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const commands = useLiveOpsStore((s) => s.activeCommands)
  const dispatchCommand = useLiveOpsStore((s) => s.dispatchCommand)
  const latestEstop = commands.find((c) => c.type === 'ESTOP' && c.robot_id === robot.robot_id)
  const recent = commands
    .filter((c) => c.robot_id === robot.robot_id && TEST_COMMANDS.has(c.type))
    .slice(-6)
    .reverse()
  const lastActivity = Math.max(armedAt ?? 0, ...recent.map((c) => Date.parse(c.stages[0]?.at ?? '') || 0))

  // Lock again whenever the robot changes.
  useEffect(() => {
    setArmedAt(null)
    setConfirmed(false)
  }, [robot.robot_id])

  useEffect(() => {
    if (armedAt === null) return
    const t = setInterval(() => {
      if (Date.now() - lastActivity > ARM_TIMEOUT_MS) setArmedAt(null)
    }, 5_000)
    return () => clearInterval(t)
  }, [armedAt, lastActivity])

  const armed = armedAt !== null
  const estopped = robot.abstract_state === 'E_STOP'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
      <section
        className="rh-panel"
        style={{
          padding: space[4], display: 'flex', gap: space[3], alignItems: 'flex-start', flexWrap: 'wrap',
          borderColor: armed ? color.amberBorder : color.border,
          // Pinned to the top of the scrolling tab so the E-Stop never leaves view.
          position: 'sticky', top: 0, zIndex: 1, background: color.surface,
        }}
      >
        {armed
          ? <ShieldAlert size={20} strokeWidth={1.75} color={color.amber} aria-hidden style={{ flexShrink: 0, marginTop: 2 }} />
          : <ShieldCheck size={20} strokeWidth={1.75} color={color.t3} aria-hidden style={{ flexShrink: 0, marginTop: 2 }} />}
        <div style={{ flex: 1, minWidth: 260, display: 'flex', flexDirection: 'column', gap: space[2] }}>
          <div style={{ fontSize: font.size.lg, fontWeight: font.weight.bold, color: color.t1 }}>
            {armed ? t('fleetDetail.tests.armedTitle') : t('fleetDetail.tests.lockedTitle')}
          </div>
          <p style={{ margin: 0, fontSize: font.size.md, color: color.t2, lineHeight: 1.5 }}>
            {t('fleetDetail.tests.warning')}
          </p>
          {armed ? (
            <div style={{ display: 'flex', gap: space[2], alignItems: 'center', flexWrap: 'wrap' }}>
              <Button size="sm" onClick={() => { setArmedAt(null); setConfirmed(false) }}>{t('fleetDetail.tests.lock')}</Button>
              <Muted>{t('fleetDetail.tests.relocks')}</Muted>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: space[3], alignItems: 'center', flexWrap: 'wrap' }}>
              <label style={{ display: 'inline-flex', gap: space[2], alignItems: 'center', fontSize: font.size.md, color: color.t1, cursor: 'pointer' }}>
                <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
                {t('fleetDetail.tests.confirmClear')}
              </label>
              <Button
                size="sm" variant="primary" disabled={!confirmed || estopped}
                title={estopped ? t('fleetDetail.tests.releaseFirst') : undefined}
                onClick={() => setArmedAt(Date.now())}
              >
                {t('fleetDetail.tests.arm')}
              </Button>
            </div>
          )}
        </div>
        <EStopButton
          state={robot.abstract_state}
          engageCommand={latestEstop}
          estopAvailability={getCommandAvailability(robot, 'ESTOP')}
          resetAvailability={getCommandAvailability(robot, 'RESET_ESTOP')}
          onEngage={() => dispatchCommand(robot.robot_id, 'ESTOP', t('fleetDetail.tests.estopLabel'))}
          onRelease={() => dispatchCommand(robot.robot_id, 'RESET_ESTOP', t('fleetDetail.tests.releaseEstopLabel'))}
        />
      </section>

      {/* A disabled fieldset disables every control inside it natively, so a
          locked test cannot be sent by keyboard either. */}
      <fieldset
        disabled={!armed || estopped}
        style={{ border: 'none', margin: 0, padding: 0, minWidth: 0, opacity: armed && !estopped ? 1 : 0.55 }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: space[5] }}>
          <Section title={t('fleetDetail.tests.movement')}>
            <div style={TILE_GRID}>
              <MovementDiagnosticsSection robot={robot} />
            </div>
          </Section>
          {robot.robot_type !== 'wheel' && (
            <Section title={t('fleetDetail.tests.balance')}>
              <div style={TILE_GRID}>
                <BalanceDiagnosticsSection robot={robot} />
              </div>
            </Section>
          )}
        </div>
      </fieldset>

      <Section title={t('fleetDetail.tests.results')}>
        {recent.length === 0 ? (
          <Muted>{t('fleetDetail.tests.noResults')}</Muted>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: space[1] }}>
            {recent.map((c) => {
              const o = outcome(t, c)
              return (
                <li key={c.command_id} style={{
                  display: 'flex', alignItems: 'center', gap: space[3], padding: `${space[1]}px 0`,
                  borderBottom: `1px solid ${color.border}`, fontSize: font.size.md,
                }}>
                  <span style={{ flex: 1, color: color.t1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.label}</span>
                  {c.simulated && <Badge>{t('fleetDetail.tests.simulated')}</Badge>}
                  <Badge tone={o.tone} dot>{o.text}</Badge>
                  <span style={{ color: color.t3, fontSize: font.size.sm, fontVariantNumeric: 'tabular-nums', borderRadius: radius.xs }}>
                    {new Date(c.stages[0]?.at ?? Date.now()).toLocaleTimeString(formatLocale())}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </Section>
    </div>
  )
}
