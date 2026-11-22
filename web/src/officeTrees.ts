/** Pastel canopy tones — match interior plants / Notion greens. */
export const TREE_CANOPY = ['#6fbf8f', '#5faf7f', '#7ec994', '#4f9a6e', '#8bc9a0'] as const

export type ExteriorTreeSpec = {
  id: string
  x: number
  z: number
  scale: number
  canopy: string
}

/**
 * Plaza ring trees — clear of the office floor, readable from overview cam.
 * Positions sit outside the wood floor plate (~16.6×14.4).
 */
export function buildExteriorTrees(): ExteriorTreeSpec[] {
  // [x, z, scale]
  const sites: Array<[number, number, number]> = [
    [-9.6, 7.2, 1.05],
    [-11.2, 3.4, 0.92],
    [-10.4, -1.2, 1.12],
    [-11.0, -5.6, 0.88],
    [-9.2, -9.0, 1.0],
    [-5.4, -10.6, 0.95],
    [-1.2, -11.2, 1.08],
    [3.6, -10.8, 0.9],
    [7.8, -9.4, 1.05],
    [10.2, -5.8, 0.98],
    [11.0, -1.0, 1.15],
    [10.6, 3.8, 0.88],
    [9.4, 7.6, 1.02],
    [5.2, 9.4, 0.94],
    [0.6, 10.0, 1.1],
    [-4.0, 9.2, 0.9],
    // Inner plaza accents (still outside the wood floor ~8.3)
    [-8.6, 0.8, 0.72],
    [8.8, -2.4, 0.78],
    [-2.8, -9.4, 0.7],
    [4.4, 8.6, 0.74],
  ]
  return sites.map(([x, z, scale], i) => ({
    id: `tree-${i}`,
    x,
    z,
    scale,
    canopy: TREE_CANOPY[i % TREE_CANOPY.length],
  }))
}
