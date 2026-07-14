import type { JointLimit, Leg, MotorDiagnostics, RobotDiagnostics } from '@/types'

const LEGS: Leg[] = ['front_left', 'front_right', 'rear_left', 'rear_right']
const JOINT_NAMES = ['hip', 'thigh', 'knee'] as const

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString()

function legLabel(leg: Leg): string {
  return leg.split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ')
}

/** 12 joints (3 per leg x 4 legs) — a representative quadruped joint count,
 * not a claim of the SDK's exact 16-motor wiring breakdown (see
 * types/diagnostics.ts header). `faultLeg`, if given, elevates that leg's
 * knee joint into a fault state — used to keep RVR-03's joint data
 * consistent with its existing "Rear-left actuator overcurrent" fault
 * already recorded in mockFleetDetails. */
function buildJoints(faultLeg?: Leg): MotorDiagnostics[] {
  return LEGS.flatMap((leg) =>
    JOINT_NAMES.map((joint_name) => {
      const isFaultJoint = leg === faultLeg && joint_name === 'knee'
      return {
        joint_id: `${leg}_${joint_name}`,
        leg,
        joint_name,
        mode: isFaultJoint ? 'fault' : 'servo',
        position_deg: Math.round((Math.random() * 60 - 30) * 10) / 10,
        velocity_dps: isFaultJoint ? 0 : Math.round((Math.random() * 20 - 10) * 10) / 10,
        torque_nm: isFaultJoint ? 0 : Math.round((Math.random() * 8 + 2) * 10) / 10,
        motor_temp_c: isFaultJoint ? 78 : Math.round(38 + Math.random() * 12),
        error_flag: isFaultJoint ? 'fault' : 'normal',
      } satisfies MotorDiagnostics
    }),
  )
}

function buildJointLimits(): JointLimit[] {
  return LEGS.flatMap((leg) =>
    JOINT_NAMES.map((joint_name) => ({
      joint_id: `${leg}_${joint_name}`,
      leg,
      joint_name,
      position_range_deg: joint_name === 'hip' ? [-34.6, 34.6] : joint_name === 'thigh' ? [-90, 90] : [-135, -10],
      torque_range_nm: [-24, 24],
      speed_range_dps: [-360, 360],
      kp: 60,
      kd: 2,
    } satisfies JointLimit)),
  )
}

function buildVersion(overrides?: Partial<RobotDiagnostics['version']>): RobotDiagnostics['version'] {
  return {
    algorithm: '1.2.0.0-stable+a11e8e4',
    can_board: '1.0.3.7',
    bms: '1.0.1.4',
    controller: '1.2.0.0-stable-7fd174365',
    system: 'v1.1.0',
    battery_group: '0.0.0.1',
    audio: '3.2.5',
    servo_by_leg: {
      front_left: '2.1.7.0', front_right: '2.1.7.0', rear_left: '2.1.7.0', rear_right: '2.1.7.0',
    },
    ...overrides,
  }
}

export const mockDiagnostics: Record<string, RobotDiagnostics> = {
  'zaezae-x1-001': {
    robot_id: 'zaezae-x1-001',
    version: buildVersion(),
    joints: buildJoints(),
    jointLimits: buildJointLimits(),
    footType: { current: 'Point Foot', options: ['Point Foot', 'Wheel Foot'] },
    traffic: { status_4g: 'disabled', remaining_mb: 0, card_id: '8931070126000548891' },
    firmware: {
      current_version: 'x1-fw-3.2.1',
      available_version: null,
      size_mb: null,
      release_notes: [],
    },
    last_calibrated_at: ago(60 * 24 * 12),
  },
  'zaezae-x1-002': {
    robot_id: 'zaezae-x1-002',
    version: buildVersion(),
    joints: buildJoints(),
    jointLimits: buildJointLimits(),
    footType: { current: 'Point Foot', options: ['Point Foot', 'Wheel Foot'] },
    traffic: { status_4g: 'enabled', remaining_mb: 842, card_id: '8931070126000548902' },
    firmware: {
      current_version: 'x1-fw-3.2.1',
      available_version: '3.2.2',
      size_mb: 267.97,
      release_notes: [
        'Optimized battery management firmware, reduced standby power consumption.',
        'Added Towing Mode for both wheel-foot and point-foot versions.',
        'Fixed certain known issues.',
      ],
    },
    last_calibrated_at: ago(60 * 24 * 40),
  },
  'zaezae-x1-003': {
    robot_id: 'zaezae-x1-003',
    version: buildVersion({ controller: '1.2.0.0-stable-7fd174365 (rollback pending)' }),
    joints: buildJoints('rear_left'),
    jointLimits: buildJointLimits(),
    footType: { current: 'Point Foot', options: ['Point Foot', 'Wheel Foot'] },
    traffic: { status_4g: 'enabled', remaining_mb: 12, card_id: '8931070126000548913' },
    firmware: {
      current_version: 'x1-fw-3.1.9',
      available_version: '3.2.2',
      size_mb: 267.97,
      release_notes: [
        'Optimized battery management firmware, reduced standby power consumption.',
        'Added Towing Mode for both wheel-foot and point-foot versions.',
        'Fixed certain known issues.',
      ],
    },
    last_calibrated_at: ago(60 * 24 * 210),
  },
}

export { legLabel }
