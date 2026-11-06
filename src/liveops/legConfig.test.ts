import { describe, expect, it } from 'vitest'
import { legConfigOf, legConfigLabelKey, switchLegLabelKey } from './legConfig'
import type { RobotState } from '@/types'

const robot = (leg_config?: RobotState['leg_config']) => ({ leg_config }) as RobotState

describe('legConfigOf', () => {
  it('reads the bridge value', () => {
    expect(legConfigOf(robot('normal'))).toBe('normal')
    expect(legConfigOf(robot('x'))).toBe('x')
  })

  it('treats a bridge that never sent it as unknown, never as normal', () => {
    expect(legConfigOf(robot(undefined))).toBe('unknown')
  })
})

describe('switchLegLabelKey', () => {
  it('names the target when the configuration is known', () => {
    expect(switchLegLabelKey('normal')).toBe('command.taskBar.switchToX')
    expect(switchLegLabelKey('x')).toBe('command.taskBar.switchToNormal')
  })

  it('stays a plain toggle when unknown', () => {
    expect(switchLegLabelKey('unknown')).toBe('command.taskBar.switchLegConfig')
  })
})

describe('legConfigLabelKey', () => {
  it('has a label for every value', () => {
    expect(legConfigLabelKey('normal')).toBe('liveops.telemetry.legsNormal')
    expect(legConfigLabelKey('x')).toBe('liveops.telemetry.legsX')
    expect(legConfigLabelKey('unknown')).toBe('common.unknown')
  })
})
