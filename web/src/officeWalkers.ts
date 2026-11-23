/**
 * Calm back-and-forth walk math for office ometti.
 * Slow, staggered, never frantic — used by Completa (R3F) and mirrored in Leggera CSS.
 */

export type WalkAxis = 'x' | 'z'

export type WalkerPath = {
  /** Room-relative home on the floor. */
  home: [number, number, number]
  axis: WalkAxis
  /** Half-travel distance from home along the axis (world units). */
  amplitude: number
  /**
   * Cycles per second for a half-trip (0→1). Full back-and-forth = 2 / speed seconds.
   * Idle default ~0.07 → ~28s round trip; active a bit quicker.
   */
  speed: number
  /** Phase offset in “half-trip” units (stagger figures). */
  phase: number
}

/** Smoothstep 0→1 (no hard snaps at turnarounds). */
export function smoothstep(t: number): number {
  const x = Math.min(1, Math.max(0, t))
  return x * x * (3 - 2 * x)
}

/**
 * Triangle ping-pong in [0, 1] for position, plus facing sign along the walk axis.
 * facing = +1 while going toward +amplitude, −1 on the return.
 */
export function walkState(
  elapsed: number,
  speed: number,
  phase: number,
): { t: number; facing: 1 | -1 } {
  const u = elapsed * Math.max(0.0001, speed) + phase
  const cycle = ((u % 2) + 2) % 2
  const goingPositive = cycle <= 1
  const raw = goingPositive ? cycle : 2 - cycle
  return { t: smoothstep(raw), facing: goingPositive ? 1 : -1 }
}

/** World offset along the walk axis from home. */
export function walkOffset(t: number, amplitude: number): number {
  return -amplitude + 2 * amplitude * t
}

/** Idle vs lit speeds — still calm when a skill lights the room. */
export function walkSpeedForActivity(base: number, activity: number): number {
  return base * (1 + 0.32 * activity)
}

/** Build staggered walker paths that stay inside a room footprint. */
export function buildRoomWalkers(
  hx: number,
  hz: number,
  halfW: number,
  halfD: number,
  count: number,
  hotspot: number,
): WalkerPath[] {
  const paths: WalkerPath[] = []
  const ampX = Math.max(0.35, halfW * 0.42)
  const ampZ = Math.max(0.28, halfD * 0.36)
  for (let i = 0; i < count; i++) {
    const side = i % 2 === 0 ? -1 : 1
    const alongZ = i < 2 ? 0.18 : -0.32
    const axis: WalkAxis = i % 2 === 0 ? 'x' : 'z'
    const amplitude = axis === 'x' ? ampX * (0.85 + (i % 3) * 0.05) : ampZ * (0.8 + (i % 2) * 0.1)
    paths.push({
      home: [hx + side * 0.35, 0, hz + alongZ],
      axis,
      amplitude,
      // ~22–32s round trips, staggered by room hotspot + index
      speed: 0.062 + ((hotspot + i) % 5) * 0.006,
      phase: hotspot * 0.73 + i * 1.17 + i * 0.31,
    })
  }
  return paths
}
