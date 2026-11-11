import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { color, font, glass, radius, space } from '@/design-system/tokens'
import type { SiteMap } from '@/types/maps'

/**
 * A vertical rail of floor buttons, one per surveyed floor. The active floor is
 * a tint and a filled dot, not an outline. Positioned by the parent's wrapper,
 * so it can sit beside MapControls or anywhere else over a map.
 *
 * Memoized: MapCanvas re-renders per telemetry frame, so the caller must pass a
 * stable `onChange` or this re-renders with it.
 */
export const FloorPicker = memo(function FloorPicker({ map, value, onChange }: {
  map: SiteMap
  value: number
  onChange: (floorIndex: number) => void
}) {
  const { t } = useTranslation()
  if (map.floors.length === 0) return null

  return (
    <div
      role="group"
      aria-label={t('liveops.map.floors')}
      style={{
        ...glass.overlay, border: 'none', boxShadow: 'var(--rh-shadow-sm)',
        display: 'flex', flexDirection: 'column', gap: 2, padding: 4, borderRadius: radius.md,
      }}
    >
      {map.floors.map((floor) => {
        const active = floor.index === value
        return (
          <button
            key={floor.index}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(floor.index)}
            style={{
              display: 'flex', alignItems: 'center', gap: space[2], border: 'none', cursor: 'pointer',
              padding: '6px 10px', borderRadius: radius.sm, fontFamily: font.family, fontSize: font.size.sm,
              background: active ? color.selected : 'transparent', color: active ? color.t1 : color.t2,
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: radius.full, flexShrink: 0, background: active ? color.accent : color.t3 }} />
            {floor.label ?? t('liveops.map.floorN', { index: floor.index })}
          </button>
        )
      })}
    </div>
  )
})
