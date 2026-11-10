import i18n from '@/i18n'
import { useTranslation } from 'react-i18next'
import { color, font, space } from '@/design-system/tokens'
import type { EventSeverity, TimelineEvent } from '@/types'

const SEVERITY_COLOR: Record<EventSeverity, string> = {
  info: color.t2,
  warning: color.amber,
  fault: color.red,
  critical: color.red,
}

function timeAgo(iso: string): string {
  const sec = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (sec < 60) return i18n.t('liveops.events.agoSeconds', { n: sec })
  if (sec < 3600) return i18n.t('liveops.events.agoMinutes', { n: Math.round(sec / 60) })
  return i18n.t('liveops.events.agoHours', { n: Math.round(sec / 3600) })
}

/**
 * Mission events, alerts, and command history — a drawer opened from the
 * site bar's log button, not a self-contained collapsible (visibility is
 * controlled by the parent so one button owns it).
 */
export function EventLogPanel({ open, events }: { open: boolean; events: TimelineEvent[] }) {
  const { t } = useTranslation()
  if (!open) return null

  return (
    <div style={{
      height: 200, flexShrink: 0, background: color.surface,
      borderTop: `1px solid ${color.border}`, overflowY: 'auto', padding: `${space[1]}px 0`,
    }}>
      {events.length === 0 ? (
        <div style={{ padding: space[4], fontSize: font.size.sm, color: color.t3, textAlign: 'center' }}>
          {t('liveops.events.empty')}
        </div>
      ) : (
        events.map((e) => (
          <div key={e.event_id} style={{
            display: 'flex', alignItems: 'center', gap: space[2],
            padding: `${space[1] + 2}px ${space[4]}px`,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: SEVERITY_COLOR[e.severity], flexShrink: 0 }} />
            <span style={{
              fontSize: font.size.sm, color: color.t3, width: 64, flexShrink: 0,
              textTransform: 'capitalize',
            }}>
              {t(`liveops.events.source.${e.source}`)}
            </span>
            <span title={e.detail} style={{ fontSize: font.size.sm, color: color.t1, flex: 1, minWidth: 0 }}>{e.message}</span>
            <span style={{ fontSize: font.size.sm, color: color.t3, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{timeAgo(e.ts)}</span>
          </div>
        ))
      )}
    </div>
  )
}
