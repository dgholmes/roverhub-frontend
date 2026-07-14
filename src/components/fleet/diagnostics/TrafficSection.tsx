import { useState } from 'react'
import { CreditCard, Gauge, RefreshCw, Wifi } from 'lucide-react'
import { color, font, radius, space } from '@/design-system/tokens'
import { StatTile } from '../StatTile'
import type { TrafficStatus } from '@/types'

export function TrafficSection({ traffic }: { traffic: TrafficStatus }) {
  const [remaining, setRemaining] = useState(traffic.remaining_mb)
  const [refreshing, setRefreshing] = useState(false)

  function refresh() {
    setRefreshing(true)
    setTimeout(() => setRefreshing(false), 800)
  }

  function recharge() {
    setRemaining((r) => r + 1024)
  }

  return (
    <div style={{ border: `1px solid ${color.border}`, borderRadius: radius.md, padding: space[4], display: 'flex', flexDirection: 'column', gap: space[3] }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: space[2] }}>
        <StatTile
          icon={Wifi} label="4G Status" value={traffic.status_4g === 'enabled' ? 'Enabled' : 'Disabled'}
          valueColor={traffic.status_4g === 'enabled' ? color.green : color.t3}
        />
        <StatTile icon={Gauge} label="Remaining Traffic" value={`${remaining} MB`} />
        <StatTile icon={CreditCard} label="Traffic Card ID" value={traffic.card_id} />
      </div>
      <div style={{ display: 'flex', gap: space[2] }}>
        <button
          onClick={refresh}
          disabled={refreshing}
          style={{
            display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: radius.sm,
            background: 'transparent', border: `1px solid ${color.border}`, color: color.t2,
            fontSize: font.size.sm, fontFamily: font.family, cursor: refreshing ? 'not-allowed' : 'pointer',
          }}
        >
          <RefreshCw size={12} className={refreshing ? 'rh-spin' : undefined} />
          Refresh
        </button>
        <button
          onClick={recharge}
          style={{
            padding: '6px 12px', borderRadius: radius.sm, background: color.accentDim,
            border: `1px solid ${color.accentBorder}`, color: color.accent,
            fontSize: font.size.sm, fontWeight: font.weight.semibold, fontFamily: font.family, cursor: 'pointer',
          }}
        >
          Recharge
        </button>
      </div>
    </div>
  )
}
