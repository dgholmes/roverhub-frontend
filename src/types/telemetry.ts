/**
 * PROVISIONAL — shared/schemas/telemetry.py is currently empty (0 bytes).
 * Mirrors the TimescaleDB telemetry hypertable sample shape described in
 * CLAUDE.md's "Telemetry Flow" section (1 Hz merged DDS + gRPC sample).
 */

export interface ImuSample {
  roll_deg: number
  pitch_deg: number
  yaw_deg: number
}

export interface TelemetrySample {
  ts: string
  battery_pct: number
  speed_mps: number
  imu: ImuSample
  dds_quality: number
  bridge_latency_ms: number
}
