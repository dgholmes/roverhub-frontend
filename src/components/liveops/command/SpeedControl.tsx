import { useRef, useState } from 'react'
import { Gauge } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { color, font, radius, space } from '@/design-system/tokens'
import {
  CUSTOM_SPEED_STEP, MAX_SPEED_PCT, MIN_SPEED_PCT, SPEED_TIERS, speedPctOf,
  useDriveSpeed, useDriveSpeedStore, type SpeedTier,
} from '@/store/useDriveSpeedStore'
import { CommandFace, commandButtonStyle } from '../mission/ActionButton'
import { BarCard } from './BarCard'

/** The presets the card offers. 'custom' is what the slider sets, not a choice. */
const PRESETS = SPEED_TIERS.filter((tier): tier is Exclude<SpeedTier, 'custom'> => tier !== 'custom')

/**
 * Manual-drive speed, beside Take control: a button reading the % the robot is
 * set to, opening a card like Speak's -- Slow / Normal / Fast, then a slider,
 * MIN_SPEED_PCT to MAX_SPEED_PCT. The slider always shows the current %, and
 * moving it sets that % directly (the store's 'custom' tier), so no preset is
 * lit until one is picked again. It sets the robot's own speed %, as the
 * handheld remote does, and a held key is full stick (useDriveSpeedStore says
 * why).
 *
 * Always enabled: it is a local setting that sends nothing by itself, so it can
 * be chosen before taking control.
 *
 * Was a segmented control inline in the bar until 2026-11-11, which the
 * operator found sat badly among the buttons.
 */
export function SpeedControl({ robotId }: { robotId: string }) {
  const { t } = useTranslation()
  const speed = useDriveSpeed(robotId)
  const setTier = useDriveSpeedStore((s) => s.setTier)
  const setCustomPct = useDriveSpeedStore((s) => s.setCustomPct)
  const pct = speedPctOf(speed)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  return (
    <div ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={t('command.speed.title')}
        aria-expanded={open}
        style={{ ...commandButtonStyle(), cursor: 'pointer', background: open ? color.cardHover : color.card }}
      >
        <CommandFace icon={Gauge} label={t('command.speed.button', { pct })} />
      </button>

      <BarCard open={open} onClose={() => setOpen(false)} anchorRef={ref} width={220}>
        {/* Same row as Speak's Play / Say / Shout. */}
        <div role="tablist" aria-label={t('command.speed.label')} style={{ display: 'flex', gap: 2, marginBottom: space[2] }}>
          {PRESETS.map((tier) => {
            const active = speed.tier === tier
            return (
              <button
                key={tier}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTier(robotId, tier)}
                style={{
                  flex: 1, padding: '5px 0', borderRadius: radius.sm, fontSize: font.size.sm, fontFamily: font.family,
                  background: active ? color.cardHover : 'transparent',
                  border: `1px solid ${active ? color.borderLt : 'transparent'}`,
                  color: active ? color.t1 : color.t3, fontWeight: active ? font.weight.semibold : font.weight.regular,
                  cursor: 'pointer',
                }}
              >
                {t(`command.speed.${tier}`)}
              </button>
            )
          })}
        </div>

        {/* Same row as Speak's volume. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 2px' }}>
          <Gauge size={11} strokeWidth={2} color={color.t2} aria-hidden />
          <input
            type="range" min={MIN_SPEED_PCT} max={MAX_SPEED_PCT} step={CUSTOM_SPEED_STEP} value={pct}
            aria-label={t('command.speed.sliderAria')}
            onChange={(e) => setCustomPct(robotId, Number(e.target.value))}
            style={{ flex: 1, accentColor: color.accent, cursor: 'pointer' }}
          />
          <span style={{
            fontSize: font.size.xs, color: color.t2, minWidth: 30, textAlign: 'right',
            fontVariantNumeric: 'tabular-nums',
          }}>
            {t('command.speed.pct', { pct })}
          </span>
        </div>
      </BarCard>
    </div>
  )
}
