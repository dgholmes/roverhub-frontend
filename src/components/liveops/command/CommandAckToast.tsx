import { useEffect } from 'react'
import { Check, Clock, X } from 'lucide-react'
import { color, font, radius, shadow, space } from '@/design-system/tokens'
import { COMMAND_STAGE_ORDER } from '@/types/commands'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'
import type { Command, CommandStage } from '@/types'

const STAGE_LABEL: Record<CommandStage, string> = {
  requested: 'Sending…',
  cloud_received: 'Received by cloud',
  cloud_validated: 'Validated',
  bridge_received: 'Received by bridge',
  local_safety_check: 'Safety check',
  sdk_sent: 'Sent to SDK',
  robot_acknowledged: 'Robot acknowledged',
  execution_started: 'Executing',
  execution_completed: 'Completed',
  execution_failed: 'Failed',
  timed_out: 'Timed out',
  cancelled: 'Cancelled',
}

function stageProgress(stage: CommandStage): number {
  const idx = COMMAND_STAGE_ORDER.indexOf(stage)
  return idx === -1 ? 100 : Math.round(((idx + 1) / COMMAND_STAGE_ORDER.length) * 100)
}

function ToastCard({ command }: { command: Command }) {
  const snapshotUrl = useLiveOpsStore((s) => s.snapshotUrl)
  const dismissCommand = useLiveOpsStore((s) => s.dismissCommand)
  const stage = command.current_stage

  // Toast persistence rules (docs/05-ui-ux.md §6.3): completed/cancelled
  // auto-dismiss; failed/timed-out persist until the operator dismisses.
  useEffect(() => {
    if (stage === 'execution_completed') {
      const t = setTimeout(() => dismissCommand(command.command_id), 4000)
      return () => clearTimeout(t)
    }
    if (stage === 'cancelled') {
      const t = setTimeout(() => dismissCommand(command.command_id), 2000)
      return () => clearTimeout(t)
    }
  }, [stage, command.command_id, dismissCommand])

  const barColor =
    stage === 'execution_completed' ? color.green :
    stage === 'execution_failed' ? color.red :
    stage === 'timed_out' ? color.amber :
    stage === 'cancelled' ? color.t3 :
    color.accent

  const persistent = stage === 'execution_failed' || stage === 'timed_out'

  return (
    <div
      // A failed or timed-out command is the one thing here an operator must
      // not miss, and it was previously announced to nobody: this stack had no
      // live region anywhere, so a screen-reader user was never told a command
      // — including E-Stop — had failed. `alert` is assertive because the
      // failure of a dispatched command is exactly the interruption case;
      // everything else is a polite status update.
      // docs/audit/2026-08-12-ui-ux-audit.md A-17.
      role={persistent ? 'alert' : 'status'}
      style={{
        width: 280, background: color.elevated, border: `1px solid ${color.border}`,
        borderRadius: radius.lg, padding: space[3], boxShadow: shadow.lg,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: barColor, display: 'inline-block', flexShrink: 0 }} />
          <span
            title={command.label}
            style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.t1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {command.label}
          </span>
          {command.simulated && (
            <span
              title="This command type is not wired to the robot yet — the outcome shown is simulated."
              style={{
                flexShrink: 0, fontSize: font.size.xs, fontWeight: font.weight.bold,
                letterSpacing: '0.04em', color: color.amber, background: color.amberBg,
                border: `1px solid ${color.amberBorder}`, borderRadius: radius.xs, padding: '1px 5px',
              }}
            >
              SIMULATED
            </span>
          )}
        </div>
        {persistent && (
          <button
            onClick={() => dismissCommand(command.command_id)}
            aria-label="Dismiss"
            style={{ background: 'transparent', border: 'none', color: color.t3, cursor: 'pointer', flexShrink: 0 }}
          >
            <X size={12} />
          </button>
        )}
      </div>
      <div style={{ fontSize: font.size.xs, color: color.t3, marginBottom: 6 }}>{command.command_id}</div>
      <div style={{ height: 4, background: color.border, borderRadius: radius.full, overflow: 'hidden', marginBottom: 6 }}>
        <div style={{ width: `${stageProgress(stage)}%`, height: '100%', background: barColor, borderRadius: radius.full }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: font.size.xs, color: color.t3 }}>
        {stage === 'execution_completed' && <Check size={11} color={color.green} />}
        {stage === 'timed_out' && <Clock size={11} color={color.amber} />}
        {STAGE_LABEL[stage]}
        {command.failure_reason && ` — ${command.failure_reason}`}
      </div>
      {/* SNAPSHOT is the only command that hands back an artifact, and the ack is
          where the operator already looks for the outcome -- so the capture is
          shown here rather than buried in a gallery that does not exist yet.
          The image is a thumbnail with the full-size version one click away;
          mockDataProvider returns an empty URL, which correctly renders nothing
          instead of a broken image. */}
      {typeof command.result?.snapshot_id === 'string' && snapshotUrl(command.result.snapshot_id) && (
        <a
          href={snapshotUrl(command.result.snapshot_id as string)}
          target="_blank"
          rel="noreferrer"
          title={`Open the full-size ${String(command.result.camera ?? '')} capture`}
          style={{ display: 'block', marginTop: space[2] }}
        >
          <img
            src={snapshotUrl(command.result.snapshot_id as string)}
            alt={`${String(command.result.camera ?? 'camera')} snapshot`}
            style={{
              display: 'block', width: '100%', borderRadius: radius.sm,
              border: `1px solid ${color.border}`,
            }}
          />
        </a>
      )}
    </div>
  )
}

/**
 * Stacks in the lower-right corner, above the timeline (docs/05-ui-ux.md
 * §6.1). Retention is in `@/liveops/commandToasts`: transient commands compete
 * for a fixed number of slots by recency, failures persist until dismissed.
 * (This comment previously claimed the store evicted completed toasts first;
 * it evicted purely by recency, so a failed E-Stop could be pushed off the
 * screen by five routine commands.)
 */
export function CommandAckToast() {
  const activeCommands = useLiveOpsStore((s) => s.activeCommands)
  if (activeCommands.length === 0) return null

  return (
    <div style={{
      // Top-centre: the one spot no LiveOps view puts a panel (telemetry is
      // top-left, camera controls or the camera dock top-right, map controls
      // and quick actions bottom-right).
      position: 'absolute', top: space[3], left: '50%', transform: 'translateX(-50%)', zIndex: 950,
      display: 'flex', flexDirection: 'column', gap: space[2],
    }}>
      {activeCommands.map((c) => (
        <ToastCard key={c.command_id} command={c} />
      ))}
    </div>
  )
}
