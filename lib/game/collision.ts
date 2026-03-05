// ── Collision Detection ─────────────────────────────────────────────────────

export interface AABB {
  x: number
  y: number
  w: number
  h: number
}

export function aabbOverlap(a: AABB, b: AABB): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

export function circleOverlap(
  x1: number, y1: number, r1: number,
  x2: number, y2: number, r2: number,
): boolean {
  const dx = x2 - x1
  const dy = y2 - y1
  const dist = dx * dx + dy * dy
  const rSum = r1 + r2
  return dist < rSum * rSum
}

export function pointInAABB(px: number, py: number, box: AABB): boolean {
  return px >= box.x && px <= box.x + box.w && py >= box.y && py <= box.y + box.h
}

export function circleAABBOverlap(
  cx: number, cy: number, cr: number,
  box: AABB,
): boolean {
  const closestX = Math.max(box.x, Math.min(cx, box.x + box.w))
  const closestY = Math.max(box.y, Math.min(cy, box.y + box.h))
  const dx = cx - closestX
  const dy = cy - closestY
  return dx * dx + dy * dy < cr * cr
}

export function distance(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1
  const dy = y2 - y1
  return Math.sqrt(dx * dx + dy * dy)
}

export function angleBetween(x1: number, y1: number, x2: number, y2: number): number {
  return Math.atan2(y2 - y1, x2 - x1)
}

// ── Spatial Hash Grid ───────────────────────────────────────────────────────

export class SpatialGrid {
  private cellSize: number
  private cells: Map<string, number[]>

  constructor(cellSize: number) {
    this.cellSize = cellSize
    this.cells = new Map()
  }

  clear() {
    this.cells.clear()
  }

  private key(cx: number, cy: number): string {
    return `${cx},${cy}`
  }

  insert(id: number, x: number, y: number, r: number) {
    const minCX = Math.floor((x - r) / this.cellSize)
    const maxCX = Math.floor((x + r) / this.cellSize)
    const minCY = Math.floor((y - r) / this.cellSize)
    const maxCY = Math.floor((y + r) / this.cellSize)

    for (let cx = minCX; cx <= maxCX; cx++) {
      for (let cy = minCY; cy <= maxCY; cy++) {
        const k = this.key(cx, cy)
        if (!this.cells.has(k)) this.cells.set(k, [])
        this.cells.get(k)!.push(id)
      }
    }
  }

  query(x: number, y: number, r: number): Set<number> {
    const result = new Set<number>()
    const minCX = Math.floor((x - r) / this.cellSize)
    const maxCX = Math.floor((x + r) / this.cellSize)
    const minCY = Math.floor((y - r) / this.cellSize)
    const maxCY = Math.floor((y + r) / this.cellSize)

    for (let cx = minCX; cx <= maxCX; cx++) {
      for (let cy = minCY; cy <= maxCY; cy++) {
        const ids = this.cells.get(this.key(cx, cy))
        if (ids) {
          for (const id of ids) result.add(id)
        }
      }
    }
    return result
  }
}

export class SpatialGridRef<T> {
  private static readonly KEY_OFFSET = 1 << 20
  private static readonly KEY_STRIDE = 1 << 21

  private cellSize: number
  private cells: Map<number, T[]>

  constructor(cellSize: number) {
    this.cellSize = cellSize
    this.cells = new Map()
  }

  clear() {
    this.cells.clear()
  }

  private key(cx: number, cy: number): number {
    return (cx + SpatialGridRef.KEY_OFFSET) * SpatialGridRef.KEY_STRIDE + (cy + SpatialGridRef.KEY_OFFSET)
  }

  private getPointCellRange(x: number, y: number, r: number) {
    return {
      minCX: Math.floor((x - r) / this.cellSize),
      maxCX: Math.floor((x + r) / this.cellSize),
      minCY: Math.floor((y - r) / this.cellSize),
      maxCY: Math.floor((y + r) / this.cellSize),
    }
  }

  private getAABBCellRange(box: AABB) {
    return {
      minCX: Math.floor(box.x / this.cellSize),
      maxCX: Math.floor((box.x + box.w) / this.cellSize),
      minCY: Math.floor(box.y / this.cellSize),
      maxCY: Math.floor((box.y + box.h) / this.cellSize),
    }
  }

  private insertIntoRange(obj: T, minCX: number, maxCX: number, minCY: number, maxCY: number) {
    for (let cx = minCX; cx <= maxCX; cx++) {
      for (let cy = minCY; cy <= maxCY; cy++) {
        const key = this.key(cx, cy)
        const cell = this.cells.get(key)
        if (cell) {
          cell.push(obj)
        } else {
          this.cells.set(key, [obj])
        }
      }
    }
  }

  private removeFromRange(obj: T, minCX: number, maxCX: number, minCY: number, maxCY: number) {
    for (let cx = minCX; cx <= maxCX; cx++) {
      for (let cy = minCY; cy <= maxCY; cy++) {
        const key = this.key(cx, cy)
        const cell = this.cells.get(key)
        if (!cell) continue

        for (let i = cell.length - 1; i >= 0; i--) {
          if (cell[i] === obj) cell.splice(i, 1)
        }

        if (cell.length === 0) this.cells.delete(key)
      }
    }
  }

  insertPoint(obj: T, x: number, y: number, r: number) {
    const { minCX, maxCX, minCY, maxCY } = this.getPointCellRange(x, y, r)
    this.insertIntoRange(obj, minCX, maxCX, minCY, maxCY)
  }

  insertAABB(obj: T, box: AABB) {
    const { minCX, maxCX, minCY, maxCY } = this.getAABBCellRange(box)
    this.insertIntoRange(obj, minCX, maxCX, minCY, maxCY)
  }

  removePoint(obj: T, x: number, y: number, r: number) {
    const { minCX, maxCX, minCY, maxCY } = this.getPointCellRange(x, y, r)
    this.removeFromRange(obj, minCX, maxCX, minCY, maxCY)
  }

  removeAABB(obj: T, box: AABB) {
    const { minCX, maxCX, minCY, maxCY } = this.getAABBCellRange(box)
    this.removeFromRange(obj, minCX, maxCX, minCY, maxCY)
  }

  query(x: number, y: number, r: number): Set<T> {
    const result = new Set<T>()
    const { minCX, maxCX, minCY, maxCY } = this.getPointCellRange(x, y, r)

    for (let cx = minCX; cx <= maxCX; cx++) {
      for (let cy = minCY; cy <= maxCY; cy++) {
        const cell = this.cells.get(this.key(cx, cy))
        if (!cell) continue
        for (const obj of cell) result.add(obj)
      }
    }

    return result
  }

  queryPoint(x: number, y: number): T[] | undefined {
    const cx = Math.floor(x / this.cellSize)
    const cy = Math.floor(y / this.cellSize)
    return this.cells.get(this.key(cx, cy))
  }
}
