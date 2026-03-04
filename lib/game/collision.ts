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
