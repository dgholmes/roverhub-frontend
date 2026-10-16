import i18n from '@/i18n'
import { ALL_LIGHTS, FRONT_LIGHT, REAR_LIGHT } from '@/lib/robotLights'
import type { CommandType, RobotType } from '@/types'
import { BLOCK_SPECS } from '@/components/missions/visual-program/blockSpecs'
import type { CommandStep, Condition, ProgramBlock, Step } from './types'

const tr = i18n.t as unknown as (key: string, options?: Record<string, unknown>) => string
const label = (key: string, options?: Record<string, unknown>) => tr(`missions.program.step.${key}`, options)

const num = (b: ProgramBlock, f: string): number => Number(b.fields[f])
const str = (b: ProgramBlock, f: string): string => String(b.fields[f])

function chain(b: ProgramBlock, input: string): ProgramBlock[] {
  const v = b.inputs[input]
  return Array.isArray(v) ? v : []
}

function conditionOf(b: ProgramBlock): { condition: Condition; text: string } {
  const c = b.inputs.COND
  const block = c && !Array.isArray(c) ? c : null
  switch (block?.type) {
    case 'rh_cond_battery_below': {
      const pct = num(block, 'PCT')
      return { condition: { kind: 'batteryBelow', pct }, text: label('cond.batteryBelow', { pct }) }
    }
    case 'rh_cond_fallen': return { condition: { kind: 'fallen' }, text: label('cond.fallen') }
    case 'rh_cond_standing': return { condition: { kind: 'standing' }, text: label('cond.standing') }
    case 'rh_cond_avoidance_on': return { condition: { kind: 'avoidanceOn' }, text: label('cond.avoidanceOn') }
    default: return { condition: { kind: 'missing' }, text: label('cond.missing') }
  }
}

/**
 * Compiles the blocks chained after the Start block into a step tree. Blocks
 * of an unknown type compile to nothing, so a saved program from a newer
 * build still loads. The robot type only picks the SDK name for stand/walk.
 */
export function compileProgram(blocks: ProgramBlock[], robotType: RobotType | null): Step[] {
  const wheel = robotType === 'wheel'
  const out: Step[] = []

  const command = (
    b: ProgramBlock,
    type: CommandType,
    params: Record<string, unknown>,
    text: string,
    extra: Partial<CommandStep> = {},
  ): void => {
    const quadOnly = BLOCK_SPECS[b.type]?.quadOnly || extra.quadOnly
    out.push({ kind: 'command', blockId: b.id, type, params, label: text, ...extra, ...(quadOnly ? { quadOnly: true } : {}) })
  }
  const dir = (d: string) => label(`dir.${d}`)
  const onOff = (s: string) => label(`state.${s}`)

  for (const b of blocks) {
    switch (b.type) {
      case 'rh_move': {
        const direction = str(b, 'DIRECTION'), distance = num(b, 'DISTANCE')
        command(b, 'LINE_WALK', { direction, distance }, label('move', { dir: dir(direction), distance }))
        break
      }
      case 'rh_set_speed': {
        const ratio = num(b, 'SPEED')
        command(b, 'SET_SPEED_RATIO', { ratio }, label('setSpeed', { speed: ratio }))
        break
      }
      case 'rh_rotate': {
        const direction = str(b, 'DIRECTION'), angle = num(b, 'ANGLE')
        command(b, 'ROTATE', { direction, angle }, label('rotate', { dir: dir(direction), angle }))
        break
      }
      case 'rh_rotate_turns': {
        const direction = str(b, 'DIRECTION'), turns = num(b, 'TURNS')
        command(b, 'CIRCLE', { direction, turns }, label('turns', { dir: dir(direction), turns }))
        break
      }
      case 'rh_move_towards': {
        const heading = num(b, 'HEADING'), distance = num(b, 'DISTANCE')
        if (heading !== 0) {
          const direction = heading >= 0 ? 'left' : 'right'
          const angle = Math.abs(heading)
          command(b, 'ROTATE', { direction, angle }, label('rotate', { dir: dir(direction), angle }))
        }
        command(b, 'LINE_WALK', { direction: 'forward', distance }, label('move', { dir: dir('forward'), distance }))
        break
      }
      case 'rh_avoidance': {
        const s = str(b, 'STATE')
        command(b, 'SET_OBSTACLE_AVOIDANCE', { enabled: s === 'on' }, label('avoidance', { state: onOff(s) }))
        break
      }
      case 'rh_pose': {
        const mode = str(b, 'MODE') === 'static' ? 'static' : 'dynamic'
        const duration = num(b, 'DURATION')
        command(
          b,
          mode === 'static' ? 'STATIC_POSE' : 'DYNAMIC_POSE',
          { duration, roll_deg: num(b, 'ROLL'), pitch_deg: num(b, 'PITCH'), yaw_deg: num(b, 'YAW'), height_m: num(b, 'HEIGHT') },
          label('pose', { mode: label(`poseMode.${mode}`), duration }),
        )
        break
      }
      case 'rh_trick': {
        const trick = str(b, 'TRICK')
        command(b, 'SET_STATE', { state: trick }, label('trick', { trick }))
        break
      }
      case 'rh_mode': {
        const mode = str(b, 'MODE')
        const text = label('mode', { mode: label(`modeName.${mode}`) })
        if (mode === 'ready') command(b, 'SET_STATE', { state: 'ready' }, text)
        else if (mode === 'stand') command(b, 'SET_STATE', { state: wheel ? 'wheel_loco' : 'balance_stand' }, text)
        // Trot is quad-only, but BLOCK_SPECS flags rh_mode as a whole, so mark it here.
        else if (mode === 'trot') command(b, 'SET_GAIT', { gait: 'flying_trot' }, text, { quadOnly: true })
        else if (mode === 'walk') command(b, 'SET_GAIT', { gait: wheel ? 'wheel_loco' : 'walk' }, text)
        break
      }
      case 'rh_switch_layout':
        command(b, 'CHANGE_MODE', {}, label('switchLayout'))
        break
      case 'rh_lights':
      case 'rh_led': {
        // rh_led is the legacy block: no fields, so it behaves as "both on".
        const legacy = b.type === 'rh_led'
        const which = legacy ? 'both' : str(b, 'WHICH')
        const on = legacy || str(b, 'STATE') === 'on'
        const names = which === 'front' ? [FRONT_LIGHT] : which === 'rear' ? [REAR_LIGHT] : ALL_LIGHTS
        command(
          b,
          'LED_SIGNAL',
          { names, r: 0, g: 0, b: 0, brightness: on ? 255 : 0, priority: 0 },
          label('lights', { which: label(`lightsWhich.${which}`), state: onOff(on ? 'on' : 'off') }),
        )
        break
      }
      case 'rh_speak': {
        const text = str(b, 'TEXT')
        command(b, 'SPEAK', { volume: 100 }, tr('missions.program.speak', { text }), {
          speech: { text, untilDone: str(b, 'UNTIL_DONE') === 'until' },
        })
        break
      }
      case 'rh_stop_sound':
        command(b, 'STOP_SPEAK', {}, label('stopSound'))
        break
      case 'rh_snapshot': {
        const camera = str(b, 'CAMERA')
        command(b, 'SNAPSHOT', { camera }, label('snapshot', { camera: label(`camera.${camera}`) }))
        break
      }
      case 'rh_wait': {
        const seconds = num(b, 'SECONDS')
        out.push({ kind: 'wait', blockId: b.id, seconds, label: tr('missions.program.waitSeconds', { seconds }) })
        break
      }
      case 'rh_repeat': {
        const times = num(b, 'TIMES')
        out.push({ kind: 'repeat', blockId: b.id, times, body: compileProgram(chain(b, 'DO'), robotType), label: label('repeat', { times }) })
        break
      }
      case 'rh_repeat_until': {
        const { condition, text } = conditionOf(b)
        out.push({ kind: 'repeatUntil', blockId: b.id, condition, body: compileProgram(chain(b, 'DO'), robotType), label: label('repeatUntil', { condition: text }) })
        break
      }
      case 'rh_wait_until': {
        const { condition, text } = conditionOf(b)
        out.push({ kind: 'waitUntil', blockId: b.id, condition, label: label('waitUntil', { condition: text }) })
        break
      }
      case 'rh_if': {
        const { condition, text } = conditionOf(b)
        out.push({
          kind: 'if',
          blockId: b.id,
          condition,
          then: compileProgram(chain(b, 'DO'), robotType),
          else: compileProgram(chain(b, 'ELSE'), robotType),
          label: label('if', { condition: text }),
        })
        break
      }
      default:
        break
    }
  }
  return out
}
