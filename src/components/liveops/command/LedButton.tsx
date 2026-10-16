import { useState } from 'react'
import { Flashlight, FlashlightOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { DisabledReasonButton } from '@/components/common/DisabledReason'
import { CommandFace, commandButtonStyle } from '../mission/ActionButton'
import type { CommandAvailability } from '@/types'
import { ALL_LIGHTS } from '@/lib/robotLights'

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
  const { t } = useTranslation()
  const [on, setOn] = useState(false)

  return (
    <DisabledReasonButton
      enabled={availability.enabled}
      reason={availability.reason}
      onClick={() => {
        const next = !on
        setOn(next)
        onToggle(
          { names: ALL_LIGHTS, r: 0, g: 0, b: 0, brightness: next ? 255 : 0, priority: 0 },
          next ? t('command.light.commandOn') : t('command.light.commandOff'),
        )
      }}
      aria-pressed={on}
      style={commandButtonStyle(on ? 'amber' : 'default')}
    >
      <CommandFace icon={on ? Flashlight : FlashlightOff} label={on ? t('command.light.on') : t('command.light.label')} />
    </DisabledReasonButton>
  )
}
