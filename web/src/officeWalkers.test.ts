import { describe, expect, it } from 'vitest'
import {
  buildRoomWalkers,
  smoothstep,
  walkOffset,
  walkSpeedForActivity,
  walkState,
} from './officeWalkers'

describe('officeWalkers', () => {
  it('smoothstep clamps and eases endpoints', () => {
    expect(smoothstep(0)).toBe(0)
    expect(smoothstep(1)).toBe(1)
    expect(smoothstep(0.5)).toBeCloseTo(0.5, 5)
    expect(smoothstep(-1)).toBe(0)
    expect(smoothstep(2)).toBe(1)
  })

  it('walkState ping-pongs calmly and flips facing', () => {
    const a = walkState(0, 0.1, 0)
    expect(a.t).toBeCloseTo(0, 5)
    expect(a.facing).toBe(1)

    const mid = walkState(10, 0.1, 0) // half-trip at speed 0.1 → t≈1
    expect(mid.t).toBeCloseTo(1, 5)
    expect(mid.facing).toBe(1)

    const back = walkState(15, 0.1, 0) // into return leg
    expect(back.facing).toBe(-1)
    expect(back.t).toBeGreaterThan(0)
    expect(back.t).toBeLessThan(1)
  })

  it('walkOffset maps 0→1 to −amp→+amp', () => {
    expect(walkOffset(0, 1.2)).toBeCloseTo(-1.2, 5)
    expect(walkOffset(1, 1.2)).toBeCloseTo(1.2, 5)
    expect(walkOffset(0.5, 1.2)).toBeCloseTo(0, 5)
  })

  it('active walk stays only modestly faster', () => {
    const idle = walkSpeedForActivity(0.07, 0)
    const lit = walkSpeedForActivity(0.07, 1)
    expect(lit / idle).toBeLessThan(1.4)
    expect(lit).toBeGreaterThan(idle)
  })

  it('buildRoomWalkers stays inside footprint and staggers', () => {
    const paths = buildRoomWalkers(0, 0, 1.9, 1.5, 2, 3)
    expect(paths).toHaveLength(2)
    expect(paths[0].axis).toBe('x')
    expect(paths[1].axis).toBe('z')
    expect(paths[0].amplitude).toBeLessThanOrEqual(1.9 * 0.5)
    expect(paths[0].phase).not.toBe(paths[1].phase)
    expect(paths[0].speed).toBeLessThan(0.12)
  })
})
