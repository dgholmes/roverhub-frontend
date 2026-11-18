import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Signpost } from 'lucide-react'
import { Segmented } from '@/components/kit'
import { color, font, radius, space } from '@/design-system/tokens'
import { getCommandAvailability } from '@/liveops/commandPolicy'
import { NAV_STUCK_POLICIES, readNavStuckPolicy } from '@/liveops/navStuck'
import { refusalText } from '@/lib/refusals'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'
import type { RobotState } from '@/types'
import type { NavStuckPolicy } from '@/types/robotState'

/**
 * The robot's setting for a stuck walk (schema 0.0.27): 물어보기 (ask), 로봇이
 * 정하기 (the robot decides) or 멈추기 (stop), with the mock's one-line hint
 * under it. It is kept on the robot, so the control shows what /state says
 * (`nav_stuck_policy`) and sends SET_NAV_STUCK_POLICY to change it; an older
 * bridge has no such setting, and gets no control.
 *
 * In LiveOps it sits with the walk tools (`NavStuckPolicyMenu`), in Fleet in
 * the robot's Overview (`NavStuckPolicySection`). Both read `useNavStuckPolicy`.
 */

export interface NavStuckPolicyState {
  /** Null: the robot has no such setting (a bridge older than 0.0.27). */
  value: NavStuckPolicy | null
  saving: boolean
  error: string | null
  enabled: boolean
  reason?: string
  onChange: (policy: NavStuckPolicy) => void
}

/** What the robot says, what this operator just asked for, and the sending. */
export function useNavStuckPolicy(robot: RobotState): NavStuckPolicyState {
  const { t } = useTranslation()
  const dispatchCommandAsync = useLiveOpsStore((s) => s.dispatchCommandAsync)
  const current = readNavStuckPolicy(robot.nav_stuck_policy)
  // The choice sent, shown until /state says it (or the robot refuses it).
  const [asked, setAsked] = useState<{ robotId: string; policy: NavStuckPolicy; done: boolean } | null>(null)
  const [error, setError] = useState<{ robotId: string; text: string } | null>(null)
  const sent = useRef(0)
  const robotId = robot.robot_id

  const mine = asked && asked.robotId === robotId ? asked : null
  const settled = mine?.done && mine.policy === current
  useEffect(() => { if (settled) setAsked(null) }, [settled])

  const onChange = useCallback((policy: NavStuckPolicy) => {
    const seq = ++sent.current
    setAsked({ robotId, policy, done: false })
    setError(null)
    void dispatchCommandAsync(robotId, 'SET_NAV_STUCK_POLICY', t('liveops.nav.stuckPolicy.command'), { policy })
      .then(({ result, command }) => {
        if (seq !== sent.current) return
        if (result === 'completed') {
          setAsked((a) => (a && a.policy === policy ? { ...a, done: true } : a))
          return
        }
        setAsked(null)
        const why = command.failure_reason ? refusalText(t, command.failure_reason) : t('command.refusal.unknown')
        setError({ robotId, text: t('liveops.nav.stuckPolicy.failed', { reason: why }) })
      })
  }, [dispatchCommandAsync, robotId, t])

  // Asked only of a robot that has the setting at all.
  const policy = current === null ? { enabled: false, reason: undefined } : getCommandAvailability(robot, 'SET_NAV_STUCK_POLICY')
  const value = current === null ? null : mine && !settled ? mine.policy : current
  const saving = !!mine && !mine.done
  const errorText = error && error.robotId === robotId ? error.text : null
  // One object while nothing it says changes, so the memoized menu skips
  // telemetry frames.
  return useMemo(
    () => ({ value, saving, error: errorText, enabled: policy.enabled, reason: policy.reason, onChange }),
    [value, saving, errorText, policy.enabled, policy.reason, onChange],
  )
}

/** The label, the three choices and the hint for the chosen one. */
export function NavStuckPolicyControl({ state, note = false }: { state: NavStuckPolicyState; note?: boolean }) {
  const { t } = useTranslation()
  if (!state.value) return null
  const value = state.value
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[2], wordBreak: 'keep-all' }} data-nav-stuck-policy={value}>
      <span style={{
        fontSize: font.size['2xs'], fontWeight: font.weight.bold, letterSpacing: '0.08em', textTransform: 'uppercase', color: color.t3,
      }}>
        {t('liveops.nav.stuckPolicy.label')}
      </span>
      {/* Its own row, so the column does not stretch the control. */}
      <div style={{ display: 'flex' }}>
        <Segmented<NavStuckPolicy>
          label={t('liveops.nav.stuckPolicy.aria')}
          value={value}
          onChange={(p) => { if (p !== value) state.onChange(p) }}
          options={NAV_STUCK_POLICIES.map((p) => ({
            value: p, label: t(`liveops.nav.stuckPolicy.${p}`),
            disabled: !state.enabled || state.saving, title: state.enabled ? undefined : state.reason,
          }))}
        />
      </div>
      <span style={{ fontSize: font.size.sm, lineHeight: 1.45, color: color.t2, minHeight: 36 }}>
        {state.saving ? t('liveops.nav.stuckPolicy.saving') : t(`liveops.nav.stuckPolicy.hint.${value}`)}
      </span>
      {state.error && <span role="alert" style={{ fontSize: font.size.sm, color: color.red }}>{state.error}</span>}
      {note && <span style={{ fontSize: font.size.xs, lineHeight: 1.45, color: color.t3 }}>{t('liveops.nav.stuckPolicy.note')}</span>}
    </div>
  )
}

/**
 * The setting beside Go to point and Set position: one small button naming
 * the choice, opening the control under the tool group. Nothing for an older
 * bridge. Memoized: NavTools re-renders on every telemetry frame, and this
 * reads only the policy state, which keeps its identity between them.
 */
export const NavStuckPolicyMenu = memo(function NavStuckPolicyMenu({ state }: { state: NavStuckPolicyState }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLSpanElement>(null)
  // Closes on Esc or a press anywhere else, as a menu does.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    const onDown = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false) }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onDown)
    }
  }, [open])
  if (!state.value) return null
  const label = t('liveops.nav.stuckPolicy.button', { policy: t(`liveops.nav.stuckPolicy.${state.value}`) })
  return (
    <span ref={wrap} style={{ display: 'contents' }}>
      <button
        type="button" aria-expanded={open} aria-label={label} title={label} onClick={() => setOpen((o) => !o)}
        style={{
          height: 32, padding: `0 ${space[2]}px`, border: 'none', borderRadius: radius.sm + 1,
          display: 'flex', alignItems: 'center', gap: space[1], whiteSpace: 'nowrap', cursor: 'pointer',
          fontFamily: font.family, fontSize: font.size.sm, fontWeight: font.weight.semibold,
          background: open ? color.accentDim : 'transparent', color: open ? color.t1 : color.t2,
        }}
      >
        <Signpost size={15} strokeWidth={1.8} aria-hidden />
        {t(`liveops.nav.stuckPolicy.${state.value}`)}
      </button>
      {open && (
        <div
          role="dialog" aria-label={t('liveops.nav.stuckPolicy.aria')}
          style={{
            // Opaque, over the hint lines under the tool group while it is open.
            background: color.elevated, boxShadow: 'var(--rh-shadow-md)', position: 'absolute', top: 44, left: 0, zIndex: 2,
            width: 300, maxWidth: 'calc(100vw - 48px)', padding: space[3], borderRadius: radius.lg, fontFamily: font.family,
          }}
        >
          <NavStuckPolicyControl state={state} />
        </div>
      )}
    </span>
  )
})

/** Fleet's copy, for the robot's Overview: the control and where it is kept. */
export function NavStuckPolicySection({ robot }: { robot: RobotState }) {
  const state = useNavStuckPolicy(robot)
  if (!state.value) return null
  return <NavStuckPolicyControl state={state} note />
}
