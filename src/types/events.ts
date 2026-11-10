/**
 * PROVISIONAL — shared/schemas/events.py is currently empty (0 bytes).
 * Backs MissionTimeline (docs/05-ui-ux.md §3) and the alert lifecycle
 * (docs/05-ui-ux.md §16): emitted → displayed → acknowledged → resolved/archived.
 */

export type EventSource = 'robot' | 'edge' | 'cloud' | 'operator'
export type EventSeverity = 'info' | 'warning' | 'fault' | 'critical'

export interface TimelineEvent {
  event_id: string
  source: EventSource
  severity: EventSeverity
  message: string
  /** The raw text behind `message` when it was worded for the operator (a
   * bridge refusal), for debugging. Shown on hover. */
  detail?: string
  ts: string
  command_id?: string
  waypoint_id?: string
  acknowledged: boolean
}
