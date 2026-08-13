import { useState } from 'react'
import { Flashlight, FlashlightOff } from 'lucide-react'
import { color, font, layout, radius } from '@/design-system/tokens'
import { DisabledReasonButton } from '@/components/common/DisabledReason'
import type { CommandAvailability } from '@/types'

/** The robot's real, physically-present light per the vendored SDK's
 * e3_led_control_pub.py: `fill_light1`/`fill_light3` are plain on/off white
 * illumination lights (brightness only, mode 0, no r/g/b set) -- distinct
 * from `leg_light1-4`, which are RGB decorative LEDs this robot doesn't
 * visibly have. The previous version of this button sent Red/Green/Blue
 * presets to `leg_light1`, which had no visible effect on the real hardware
 * ("the lights is not led its just white light and its not working").
 * There's no gRPC/telemetry readback for LED state (DDS-only, one-way
 * command), so `on` is tracked locally rather than mirrored from
 * `robot.*` like ObstacleAvoidanceToggle's `robot.obstacle_avoidance`. */
/** Front AND rear. These are two physically separate lights in the vendored
 * SDK's LED table -- `fill_light1` front, `fill_light3` rear (`fill_light2` is
 * listed as unavailable) -- and one LedsCmd carries a list, so both switch
 * together in a single command with a single ACK. Sending only `fill_light1`
 * lit the front and left the rear dark. */
const LIGHT_NAMES = ['fill_light1', 'fill_light3']

/**
 * Real on/off toggle for the robot's white light, matching
 * ObstacleAvoidanceToggle's toggle-button pattern (no popover — this is a
 * single physical light with a single on/off state, not a color picker).
 */
export function LedButton({
  availability, onToggle,
}: {
  availability: CommandAvailability
  onToggle: (params: { names: string[]; r: number; g: number; b: number; brightness: number; priority: number }, label: string) => void
}) {
  const [on, setOn] = useState(false)

  return (
    <DisabledReasonButton
      enabled={availability.enabled}
      reason={availability.reason}
      onClick={() => {
        const next = !on
        setOn(next)
        onToggle(
          { names: LIGHT_NAMES, r: 0, g: 0, b: 0, brightness: next ? 255 : 0, priority: 0 },
          next ? 'Light On' : 'Light Off',
        )
      }}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 4, height: layout.actionBtnHeight, minWidth: 64, padding: '0 14px',
        background: color.card, border: `1px solid ${on ? color.amberBorder : color.border}`,
        borderRadius: radius.md, color: on ? color.amber : color.t2, fontFamily: font.family, flexShrink: 0,
      }}
    >
      {on ? <Flashlight size={16} strokeWidth={1.6} /> : <FlashlightOff size={16} strokeWidth={1.6} />}
      <span style={{ fontSize: font.size.xs, fontWeight: font.weight.semibold, whiteSpace: 'nowrap' }}>
        Light
      </span>
    </DisabledReasonButton>
  )
}
