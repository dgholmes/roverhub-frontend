import { describe, expect, it } from 'vitest'
import {
  grpcAfterTelemetry,
  grpcFromFreshness,
  isRobotReachable,
  reachabilityOf,
  worseGrpcStatus,
} from './connectivityHealth'
import type { RobotConnectivity } from '@/types'

function conn(overrides: Partial<RobotConnectivity> = {}): { connectivity: RobotConnectivity } {
  return {
    connectivity: {
      robot_to_edge: 'connected',
      edge_to_cloud: 'connected',
      bridge_state: 'connected',
      bridge_latency_ms: 20,
      dds: 'connected',
      grpc: 'connected',
      ...overrides,
    },
  }
}

describe('grpcFromFreshness', () => {
  it('treats a live frame as connected', () => {
    expect(grpcFromFreshness('live')).toBe('connected')
  })

  it('treats a stale frame as degraded, not connected', () => {
    // The bug this module exists for: 'stale' used to map to 'connected',
    // because the old check only special-cased 'missing'.
    expect(grpcFromFreshness('stale')).toBe('degraded')
  })

  it('treats a missing frame as unavailable', () => {
    expect(grpcFromFreshness('missing')).toBe('unavailable')
  })
})

describe('worseGrpcStatus', () => {
  it('picks the more severe of the two', () => {
    expect(worseGrpcStatus('connected', 'degraded')).toBe('degraded')
    expect(worseGrpcStatus('degraded', 'unavailable')).toBe('unavailable')
    expect(worseGrpcStatus('unavailable', 'connected')).toBe('unavailable')
  })

  it('is order-independent', () => {
    expect(worseGrpcStatus('degraded', 'connected')).toBe(worseGrpcStatus('connected', 'degraded'))
  })

  it('returns the shared value when both agree', () => {
    expect(worseGrpcStatus('connected', 'connected')).toBe('connected')
  })
})

describe('grpcAfterTelemetry', () => {
  it('never upgrades an unavailable link back to connected', () => {
    // The core regression: with the robot powered off, the heartbeat sets
    // 'unavailable' every 5s and telemetry frames kept arriving at 10Hz. If a
    // frame can upgrade, the correct status survives ~100ms out of every 5s.
    expect(grpcAfterTelemetry('unavailable', 'live')).toBe('unavailable')
    expect(grpcAfterTelemetry('unavailable', 'stale')).toBe('unavailable')
  })

  it('never upgrades a degraded link back to connected', () => {
    expect(grpcAfterTelemetry('degraded', 'live')).toBe('degraded')
  })

  it('downgrades a connected link when frames go stale', () => {
    // Telemetry's value: it reveals an outage in stale_telemetry_threshold_s
    // (3s) rather than waiting for the 5s heartbeat.
    expect(grpcAfterTelemetry('connected', 'stale')).toBe('degraded')
    expect(grpcAfterTelemetry('connected', 'missing')).toBe('unavailable')
  })

  it('leaves a healthy link alone', () => {
    expect(grpcAfterTelemetry('connected', 'live')).toBe('connected')
  })

  it('uses the frame alone before any heartbeat has arrived', () => {
    expect(grpcAfterTelemetry(undefined, 'live')).toBe('connected')
    expect(grpcAfterTelemetry(undefined, 'stale')).toBe('degraded')
    expect(grpcAfterTelemetry(undefined, 'missing')).toBe('unavailable')
  })
})

describe('reachabilityOf', () => {
  it('reports a healthy robot as online', () => {
    expect(reachabilityOf(conn())).toBe('online')
  })

  it('distinguishes a powered-off robot from a downed bridge', () => {
    // The operator's most useful diagnostic: a healthy bridge reporting an
    // unreachable robot means "the robot is off", not "the edge is broken".
    expect(reachabilityOf(conn({ grpc: 'unavailable' }))).toBe('robot-unreachable')
    expect(reachabilityOf(conn({ grpc: 'degraded' }))).toBe('robot-unreachable')
    expect(reachabilityOf(conn({ bridge_state: 'offline' }))).toBe('bridge-offline')
  })

  it('reports bridge-offline even when grpc also looks bad', () => {
    // A dead bridge can't tell us anything about the robot, so its own status
    // is the honest headline.
    expect(reachabilityOf(conn({ bridge_state: 'offline', grpc: 'unavailable' }))).toBe('bridge-offline')
  })
})

describe('isRobotReachable', () => {
  it('is true only when gRPC is fully connected', () => {
    expect(isRobotReachable(conn())).toBe(true)
    expect(isRobotReachable(conn({ grpc: 'degraded' }))).toBe(false)
    expect(isRobotReachable(conn({ grpc: 'unavailable' }))).toBe(false)
  })
})
