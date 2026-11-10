import { useEffect, useReducer, useRef, useState } from 'react'
import { LockOpen, OctagonX, TriangleAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { color, font, radius, shadow, space } from '@/design-system/tokens'
import { Button } from '@/components/kit'
import { DisabledReasonButton } from '@/components/common/DisabledReason'
import {
  CONFIRM_TIMEOUT_MS, ESTOP_HOLD_MS, estopHoldReducer, estopTimeoutReason, initialEstopHoldState,
} from '@/liveops/estopHold'
import type { AbstractState, Command, CommandAvailability } from '@/types'
import { refusalOf } from '@/lib/refusals'

const BTN_HEIGHT = 48
const BTN_WIDTH = 148

/**
 * Single toggle control for E-Stop (docs/01-prd.md §16.2: a recoverable
 * toggle, not a one-way state) — engages when not in E_STOP, releases when
 * it is.
 *
 * The two directions deliberately use different interactions:
 *
 * - **Engage is hold-to-fire** (ESTOP_HOLD_MS). Faster than the old
 *   click-then-confirm dialog in the one moment where speed matters, and it
 *   renders no portal — the confirmation dialog portalled to `document.body`,
 *   which is outside the fullscreen element, so in fullscreen it was invisible
 *   while still trapping focus and blocking pointer events.
 * - **Release keeps its dialog.** Release is the direction that re-energizes
 *   the robot, so deliberation is the correct bias there.
 *
 * `sent` is not a resting state: if the robot does not reach E_STOP within
 * CONFIRM_TIMEOUT_MS the control reports failure and tells the operator to use
 * the physical E-Stop, rather than showing an indefinite "Sending…".
 *
 * See docs/audit/2026-08-12-ui-ux-audit.md A-01/A-02/A-03/P1-1/P1-2.
 */
export function EStopButton({
  state, estopAvailability, resetAvailability, onEngage, onRelease, engageCommand,
}: {
  state: AbstractState
  estopAvailability: CommandAvailability
  resetAvailability: CommandAvailability
  onEngage: () => void
  onRelease: () => void
  /** Most recent ESTOP command, so the button can report a real failure as soon
   * as it is known instead of waiting out its own deadline. Without this the
   * button sat at "STOPPING" for the full CONFIRM_TIMEOUT_MS while the toast
   * beside it already read "Failed" — two safety surfaces disagreeing. */
  engageCommand?: Command
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [hold, dispatch] = useReducer(estopHoldReducer, initialEstopHoldState)
  const isEstop = state === 'E_STOP'
  const availability = isEstop ? resetAvailability : estopAvailability

  // Held in a ref so the dispatch effects below can depend on `hold.phase`
  // alone. Depending on the callback identity would re-fire the engage on any
  // parent re-render — dispatching a second stop to the robot.
  const onEngageRef = useRef(onEngage)
  onEngageRef.current = onEngage

  // Drive the arming progress. Re-entering `arming` restarts the clock, so an
  // aborted hold never carries credit forward into the next attempt.
  //
  // The fire is committed by a timer, not by the animation frame: rAF is paused
  // whenever the page is not compositing (occluded window, background tab, some
  // remote-desktop sessions), and a stop that silently refuses to arm under
  // those conditions is exactly the failure this control exists to prevent. The
  // frame loop only animates the fill, so losing it costs the radial progress
  // and nothing else.
  useEffect(() => {
    if (hold.phase !== 'arming') return
    const start = performance.now()
    const commit = setTimeout(
      () => dispatch({ type: 'HOLD_TICK', elapsedMs: ESTOP_HOLD_MS }),
      ESTOP_HOLD_MS,
    )
    let raf = requestAnimationFrame(function tick() {
      dispatch({ type: 'HOLD_TICK', elapsedMs: performance.now() - start })
      raf = requestAnimationFrame(tick)
    })
    return () => { clearTimeout(commit); cancelAnimationFrame(raf) }
  }, [hold.phase])

  // Fire on entry to `sent`, and start the confirmation deadline.
  useEffect(() => {
    if (hold.phase !== 'sent') return
    onEngageRef.current()
    const t = setTimeout(() => dispatch({ type: 'TIMEOUT' }), CONFIRM_TIMEOUT_MS)
    return () => clearTimeout(t)
  }, [hold.phase])

  // The robot reaching E_STOP is the acknowledgement.
  useEffect(() => {
    if (hold.phase === 'sent' && isEstop) dispatch({ type: 'CONFIRMED' })
  }, [hold.phase, isEstop])

  // Which ESTOP command already existed before this attempt. Anything with a
  // different id is this attempt's, so an older failure can never fail a fresh
  // press.
  const priorCommandIdRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (hold.phase === 'sent') return
    priorCommandIdRef.current = engageCommand?.command_id
  }, [hold.phase, engageCommand?.command_id])

  useEffect(() => {
    if (hold.phase !== 'sent' || !engageCommand) return
    if (engageCommand.command_id === priorCommandIdRef.current) return
    if (engageCommand.current_stage !== 'execution_failed' && engageCommand.current_stage !== 'timed_out') return
    dispatch({ type: 'FAILED', reason: engageCommand.failure_reason ?? estopTimeoutReason() })
  }, [hold.phase, engageCommand])

  // Clear the confirmed flash so a later engage starts from a clean gesture.
  useEffect(() => {
    if (hold.phase !== 'confirmed') return
    const t = setTimeout(() => dispatch({ type: 'RESET' }), 1200)
    return () => clearTimeout(t)
  }, [hold.phase])

  const armed = hold.phase === 'arming'
  const inFlight = hold.phase === 'sent'
  const failed = hold.phase === 'failed'

  const label = failed ? t('command.estop.failed')
    : inFlight ? t('command.estop.stopping')
    : armed ? t('command.estop.hold')
    : isEstop ? t('command.estop.release') : t('command.estop.engage')

  // Solid red at rest, white text, in both themes. It used to be a dark maroon
  // box with red text — the same visual weight as its neighbours, which is the
  // opposite of what the one safety-critical control needs.
  const surface: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    gap: 8, height: BTN_HEIGHT, minWidth: BTN_WIDTH, padding: '0 16px',
    background: availability.enabled ? color.estop : color.redBg,
    border: `2px solid ${failed || inFlight ? '#ffffff' : availability.enabled ? color.estopBorder : color.redBorder}`,
    borderRadius: radius.md, color: availability.enabled ? '#ffffff' : color.t4,
    fontFamily: font.family, flexShrink: 0,
    position: 'relative', overflow: 'hidden',
  }

  const face = (
    <>
      {/* Radial fill showing hold progress. Purely decorative — the phase is
          also carried by the label, so this is never the only signal. */}
      {armed && (
        <span
          aria-hidden
          style={{
            position: 'absolute', inset: 0,
            // Left-to-right fill reads as "keep holding" at a glance.
            background: 'rgba(0,0,0,0.32)', width: `${hold.progress * 100}%`,
            pointerEvents: 'none',
          }}
        />
      )}
      <span style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8 }}>
        {failed ? <TriangleAlert size={20} strokeWidth={2.2} />
          : isEstop ? <LockOpen size={20} strokeWidth={2.2} />
          : <OctagonX size={20} strokeWidth={2.2} />}
        <span style={{ fontSize: font.size.xl, fontWeight: font.weight.bold, whiteSpace: 'nowrap', letterSpacing: '0.03em' }}>
          {label}
        </span>
      </span>
    </>
  )

  if (!availability.enabled) {
    return (
      <DisabledReasonButton
        enabled={false}
        reason={availability.reason}
        aria-label={isEstop ? t('command.estop.releaseAria') : t('command.estop.engageAria')}
        style={surface}
      >
        {face}
      </DisabledReasonButton>
    )
  }

  // ── Release: keep the confirmation dialog ────────────────────────────────
  if (isEstop) {
    return (
      <>
        <button
          onClick={() => setOpen(true)}
          aria-label={t('command.estop.releaseAria')}
          style={{ ...surface, cursor: 'pointer' }}
        >
          {face}
        </button>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent style={{ background: color.elevated, border: `1px solid ${color.border}`, color: color.t1 }}>
            <DialogHeader>
              <DialogTitle style={{ color: color.red }}>{t('command.estop.confirmReleaseTitle')}</DialogTitle>
              <DialogDescription style={{ color: color.t2 }}>
                {t('command.estop.confirmReleaseBody')}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter style={{ gap: space[2] }}>
              <Button onClick={() => setOpen(false)}>{t('command.estop.keepStopped')}</Button>
              <Button variant="danger" onClick={() => { onRelease(); setOpen(false) }}>
                {t('command.estop.releaseButton')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    )
  }

  // ── Engage: hold to fire ─────────────────────────────────────────────────
  const press = () => dispatch({ type: 'PRESS' })
  const release = () => dispatch({ type: 'RELEASE' })

  return (
    <>
      <button
        aria-label={t('command.estop.holdAria')}
        aria-describedby={failed ? 'estop-failure' : undefined}
        onPointerDown={(e) => {
          // Capture so a pointerup outside the button still ends the gesture.
          // Never let a capture failure prevent the stop from arming.
          try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* not capturable */ }
          press()
        }}
        onPointerUp={release}
        onPointerCancel={release}
        // Keyboard parity with the pointer gesture. Space is included even
        // though the teleop overlay currently swallows it (audit A-11) so this
        // control is correct once that is fixed.
        onKeyDown={(e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); press() } }}
        onKeyUp={(e) => { if (e.key === ' ' || e.key === 'Enter') release() }}
        onBlur={release}
        style={{ ...surface, cursor: 'pointer', touchAction: 'none' }}
      >
        {face}
      </button>

      {failed && (
        <div
          id="estop-failure"
          role="alert"
          style={{
            position: 'absolute', top: space[3], left: '50%', transform: 'translateX(-50%)',
            zIndex: 1000, display: 'flex', alignItems: 'center', gap: space[2],
            background: color.estop, color: '#ffffff', borderRadius: radius.md,
            padding: `${space[2]}px ${space[4]}px`, fontFamily: font.family,
            fontSize: font.size.lg, fontWeight: font.weight.semibold,
            boxShadow: shadow.lg, maxWidth: 'calc(100% - 32px)',
          }}
        >
          <TriangleAlert size={18} strokeWidth={2.2} />
          <FailureReason reason={hold.failureReason} />
          <button
            onClick={() => dispatch({ type: 'RESET' })}
            style={{
              marginLeft: space[2], padding: '4px 10px', borderRadius: radius.sm,
              background: 'rgba(0,0,0,0.28)', border: '1px solid #ffffff', color: '#ffffff',
              fontFamily: font.family, fontSize: font.size.md, fontWeight: font.weight.semibold,
              cursor: 'pointer', flexShrink: 0,
            }}
          >
            {t('command.estop.retry')}
          </button>
        </div>
      )}
    </>
  )
}

/** Why the stop failed, in words: a bridge refusal reads from the refusal
 * table (lib/refusals.ts), with the bridge's own text as the tooltip, and a
 * code this build has no words for still shown beside the generic line. */
function FailureReason({ reason }: { reason?: string }) {
  const { t } = useTranslation()
  if (!reason) return null
  const refusal = refusalOf(t, reason)
  if (!refusal) return <span>{reason}</span>
  return (
    <span title={refusal.raw}>
      {refusal.text}
      {!refusal.known && (
        <span style={{ marginLeft: space[2], fontSize: font.size.sm, fontWeight: font.weight.regular, fontFamily: 'monospace', opacity: 0.85 }}>
          {refusal.code}
        </span>
      )}
    </span>
  )
}
