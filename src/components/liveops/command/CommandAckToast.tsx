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
    <div style={{
      width: 280, background: color.elevated, border: `1px solid ${color.border}`,
      borderRadius: radius.lg, padding: space[3], boxShadow: shadow.lg,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: barColor, display: 'inline-block', flexShrink: 0 }} />
          <span style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.t1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {command.label}
          </span>
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
    </div>
  )
}

/**
 * Stacks in the lower-right corner, above the timeline (docs/05-ui-ux.md
 * §6.1). Max 5 shown — the store already evicts older completed toasts first.
 */
export function CommandAckToast() {
  const activeCommands = useLiveOpsStore((s) => s.activeCommands)
  if (activeCommands.length === 0) return null

  return (
    <div style={{
      position: 'absolute', right: space[4], bottom: space[4], zIndex: 900,
      display: 'flex', flexDirection: 'column', gap: space[2],
    }}>
      {activeCommands.map((c) => (
        <ToastCard key={c.command_id} command={c} />
      ))}
    </div>
  )
}
