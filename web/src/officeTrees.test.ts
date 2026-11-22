import { describe, expect, it } from 'vitest'
import { buildExteriorTrees } from './officeTrees'

/** Wood floor plate half-extents roughly match OfficeBuilding plane 16.6×14.4. */
const FLOOR_HALF_X = 8.0
const FLOOR_HALF_Z = 6.8

describe('exterior office trees', () => {
  it('places several trees outside the office floor plate', () => {
    const trees = buildExteriorTrees()
    expect(trees.length).toBeGreaterThanOrEqual(12)
    for (const t of trees) {
      const onFloor = Math.abs(t.x) < FLOOR_HALF_X && Math.abs(t.z) < FLOOR_HALF_Z
      expect(onFloor, `${t.id} at (${t.x},${t.z}) must stay off the office floor`).toBe(
        false,
      )
      expect(t.scale).toBeGreaterThan(0.5)
      expect(t.canopy).toMatch(/^#/)
    }
  })
})
