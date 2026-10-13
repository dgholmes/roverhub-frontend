/**
 * Provisional motor-temperature bands. Dobot has not published warning or
 * cut-out temperatures (question 20 in docs/09 §7), so these are cautious
 * placeholders chosen to make a hot motor stand out, not limits to act on.
 */
export const MOTOR_WARM_C = 50
export const MOTOR_HOT_C = 60

export type MotorHeat = 'normal' | 'warm' | 'hot'

export function motorHeat(tempC: number): MotorHeat {
  if (tempC >= MOTOR_HOT_C) return 'hot'
  if (tempC >= MOTOR_WARM_C) return 'warm'
  return 'normal'
}

/** Index and temperature of the hottest motor, or null for an empty list. */
export function hottestMotor(temps: number[]): { index: number; tempC: number } | null {
  if (temps.length === 0) return null
  let index = 0
  temps.forEach((t, i) => { if (t > temps[index]) index = i })
  return { index, tempC: temps[index] }
}
