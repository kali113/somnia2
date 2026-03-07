import { describe, expect, it } from 'vitest'

import {
  SpatialGrid,
  SpatialGridRef,
  aabbOverlap,
  angleBetween,
  circleAABBOverlap,
  circleOverlap,
  distance,
  pointInAABB,
} from '@/lib/game/collision'

describe('collision helpers', () => {
  it('handles primitive overlap checks with strict edge behavior', () => {
    const box = { x: 10, y: 20, w: 30, h: 40 }

    expect(aabbOverlap(box, { x: 39, y: 59, w: 10, h: 10 })).toBe(true)
    expect(aabbOverlap(box, { x: 40, y: 60, w: 10, h: 10 })).toBe(false)

    expect(circleOverlap(0, 0, 5, 8, 0, 4)).toBe(true)
    expect(circleOverlap(0, 0, 5, 9, 0, 4)).toBe(false)

    expect(pointInAABB(10, 20, box)).toBe(true)
    expect(pointInAABB(40, 60, box)).toBe(true)
    expect(pointInAABB(41, 61, box)).toBe(false)

    expect(circleAABBOverlap(5, 5, 6, { x: 10, y: 10, w: 8, h: 8 })).toBe(false)
    expect(circleAABBOverlap(9, 9, 6, { x: 10, y: 10, w: 8, h: 8 })).toBe(true)

    expect(distance(0, 0, 3, 4)).toBe(5)
    expect(angleBetween(0, 0, 0, 5)).toBeCloseTo(Math.PI / 2)
  })

  it('indexes numeric ids in the spatial hash grid', () => {
    const grid = new SpatialGrid(10)

    grid.insert(1, 5, 5, 2)
    grid.insert(3, 6, 6, 1)
    grid.insert(2, 24, 5, 2)

    expect(Array.from(grid.query(5, 5, 2)).sort((a, b) => a - b)).toEqual([1, 3])
    expect(Array.from(grid.query(15, 5, 10)).sort((a, b) => a - b)).toEqual([1, 2, 3])

    grid.clear()

    expect(Array.from(grid.query(15, 5, 10))).toEqual([])
  })

  it('indexes object references for point and box queries', () => {
    const grid = new SpatialGridRef<object>(10)
    const rock = { kind: 'rock' }
    const tree = { kind: 'tree' }
    const wall = { kind: 'wall' }
    const wallBox = { x: 20, y: 20, w: 8, h: 8 }

    grid.insertPoint(rock, 5, 5, 2)
    grid.insertPoint(tree, 7, 7, 2)
    grid.insertAABB(wall, wallBox)

    expect(Array.from(grid.query(5, 5, 3))).toEqual([rock, tree])
    expect(grid.queryPoint(22, 22)).toEqual([wall])

    grid.removePoint({ kind: 'missing' }, 100, 100, 1)
    grid.removePoint(rock, 5, 5, 2)
    grid.removePoint(tree, 7, 7, 2)
    grid.removeAABB(wall, wallBox)
    grid.clear()

    expect(Array.from(grid.query(5, 5, 3))).toEqual([])
    expect(grid.queryPoint(22, 22)).toBeUndefined()
  })
})
