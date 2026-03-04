// ── Map Generation ──────────────────────────────────────────────────────────

import {
  TILE_SIZE, MAP_TILES_X, MAP_TILES_Y, MAP_WIDTH, MAP_HEIGHT,
  POI_DEFS, CHEST_SPAWN_COUNT, FLOOR_LOOT_COUNT, COLORS,
} from './constants'
import { drawTree, drawRock, drawChest, drawBuildPiece } from './sprites'
import type { AABB } from './collision'
import type { Camera } from './camera'

// ── Tile Types ──────────────────────────────────────────────────────────────

export enum TileType {
  Grass = 0,
  Sand = 1,
  Water = 2,
  Road = 3,
  BuildingFloor = 4,
  Wall = 5,
}

// ── Map Objects ─────────────────────────────────────────────────────────────

export interface TreeObj {
  x: number; y: number
  health: number
}

export interface RockObj {
  x: number; y: number
  health: number
}

export interface ChestObj {
  x: number; y: number
  opened: boolean
}

export interface FloorLoot {
  x: number; y: number
  weaponId: string
  rarity: string
  picked: boolean
}

export interface BuildingRect extends AABB {
  hasDoor: boolean
  doorSide: 'n' | 's' | 'e' | 'w'
}

export interface PlayerBuild extends AABB {
  material: 'wood' | 'stone' | 'metal'
  health: number
  maxHealth: number
}

// ── GameMap ─────────────────────────────────────────────────────────────────

export interface GameMap {
  tiles: Uint8Array
  trees: TreeObj[]
  rocks: RockObj[]
  chests: ChestObj[]
  floorLoot: FloorLoot[]
  buildings: BuildingRect[]
  playerBuilds: PlayerBuild[]
  wallColliders: AABB[]
  poiLabels: { name: string; x: number; y: number }[]
}

// ── Seeded RNG ──────────────────────────────────────────────────────────────

function seededRandom(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff
    return (s >>> 0) / 0xffffffff
  }
}

// ── Distance from center for island shape ───────────────────────────────────

function islandFalloff(tx: number, ty: number): number {
  const cx = MAP_TILES_X / 2
  const cy = MAP_TILES_Y / 2
  const maxDist = Math.min(cx, cy) - 2
  const dx = tx - cx
  const dy = ty - cy
  const dist = Math.sqrt(dx * dx + dy * dy)
  return Math.max(0, 1 - dist / maxDist)
}

// ── Generate ────────────────────────────────────────────────────────────────

export function generateMap(seed = 42): GameMap {
  const rng = seededRandom(seed)
  const tiles = new Uint8Array(MAP_TILES_X * MAP_TILES_Y)
  const trees: TreeObj[] = []
  const rocks: RockObj[] = []
  const chests: ChestObj[] = []
  const floorLoot: FloorLoot[] = []
  const buildings: BuildingRect[] = []
  const wallColliders: AABB[] = []
  const poiLabels: { name: string; x: number; y: number }[] = []

  // 1) Base terrain
  for (let ty = 0; ty < MAP_TILES_Y; ty++) {
    for (let tx = 0; tx < MAP_TILES_X; tx++) {
      const f = islandFalloff(tx, ty)
      if (f < 0.05) {
        tiles[ty * MAP_TILES_X + tx] = TileType.Water
      } else if (f < 0.15) {
        tiles[ty * MAP_TILES_X + tx] = TileType.Sand
      } else {
        tiles[ty * MAP_TILES_X + tx] = TileType.Grass
      }
    }
  }

  // 2) Roads between POIs
  for (let i = 0; i < POI_DEFS.length - 1; i++) {
    const a = POI_DEFS[i]
    const b = POI_DEFS[i + 1]
    const ax = a.tileX + Math.floor(a.width / 2)
    const ay = a.tileY + Math.floor(a.height / 2)
    const bx = b.tileX + Math.floor(b.width / 2)
    const by = b.tileY + Math.floor(b.height / 2)

    // Horizontal then vertical
    const sx = Math.min(ax, bx)
    const ex = Math.max(ax, bx)
    for (let x = sx; x <= ex; x++) {
      for (let w = -1; w <= 1; w++) {
        const idx = (ay + w) * MAP_TILES_X + x
        if (idx >= 0 && idx < tiles.length) tiles[idx] = TileType.Road
      }
    }
    const sy = Math.min(ay, by)
    const ey = Math.max(ay, by)
    for (let y = sy; y <= ey; y++) {
      for (let w = -1; w <= 1; w++) {
        const idx = y * MAP_TILES_X + (bx + w)
        if (idx >= 0 && idx < tiles.length) tiles[idx] = TileType.Road
      }
    }
  }

  // 3) POI buildings
  for (const poi of POI_DEFS) {
    poiLabels.push({
      name: poi.name,
      x: (poi.tileX + poi.width / 2) * TILE_SIZE,
      y: (poi.tileY - 1) * TILE_SIZE,
    })

    // Generate building clusters
    const buildingCount = 3 + Math.floor(rng() * 4)
    for (let b = 0; b < buildingCount; b++) {
      const bw = 3 + Math.floor(rng() * 4)
      const bh = 3 + Math.floor(rng() * 4)
      const bx = poi.tileX + 1 + Math.floor(rng() * (poi.width - bw - 2))
      const by = poi.tileY + 1 + Math.floor(rng() * (poi.height - bh - 2))

      // Floor tiles
      for (let ty = by; ty < by + bh; ty++) {
        for (let tx = bx; tx < bx + bw; tx++) {
          if (tx >= 0 && tx < MAP_TILES_X && ty >= 0 && ty < MAP_TILES_Y) {
            tiles[ty * MAP_TILES_X + tx] = TileType.BuildingFloor
          }
        }
      }

      const doorSides = ['n', 's', 'e', 'w'] as const
      const doorSide = doorSides[Math.floor(rng() * 4)]

      const rect: BuildingRect = {
        x: bx * TILE_SIZE,
        y: by * TILE_SIZE,
        w: bw * TILE_SIZE,
        h: bh * TILE_SIZE,
        hasDoor: true,
        doorSide,
      }
      buildings.push(rect)

      // Wall colliders (4 walls with door gap)
      const doorWidth = TILE_SIZE * 1.5
      // North wall
      if (doorSide === 'n') {
        wallColliders.push({ x: rect.x, y: rect.y, w: rect.w / 2 - doorWidth / 2, h: 4 })
        wallColliders.push({ x: rect.x + rect.w / 2 + doorWidth / 2, y: rect.y, w: rect.w / 2 - doorWidth / 2, h: 4 })
      } else {
        wallColliders.push({ x: rect.x, y: rect.y, w: rect.w, h: 4 })
      }
      // South wall
      if (doorSide === 's') {
        wallColliders.push({ x: rect.x, y: rect.y + rect.h - 4, w: rect.w / 2 - doorWidth / 2, h: 4 })
        wallColliders.push({ x: rect.x + rect.w / 2 + doorWidth / 2, y: rect.y + rect.h - 4, w: rect.w / 2 - doorWidth / 2, h: 4 })
      } else {
        wallColliders.push({ x: rect.x, y: rect.y + rect.h - 4, w: rect.w, h: 4 })
      }
      // West wall
      if (doorSide === 'w') {
        wallColliders.push({ x: rect.x, y: rect.y, w: 4, h: rect.h / 2 - doorWidth / 2 })
        wallColliders.push({ x: rect.x, y: rect.y + rect.h / 2 + doorWidth / 2, w: 4, h: rect.h / 2 - doorWidth / 2 })
      } else {
        wallColliders.push({ x: rect.x, y: rect.y, w: 4, h: rect.h })
      }
      // East wall
      if (doorSide === 'e') {
        wallColliders.push({ x: rect.x + rect.w - 4, y: rect.y, w: 4, h: rect.h / 2 - doorWidth / 2 })
        wallColliders.push({ x: rect.x + rect.w - 4, y: rect.y + rect.h / 2 + doorWidth / 2, w: 4, h: rect.h / 2 - doorWidth / 2 })
      } else {
        wallColliders.push({ x: rect.x + rect.w - 4, y: rect.y, w: 4, h: rect.h })
      }

      // Chest inside building
      chests.push({
        x: rect.x + rect.w / 2 + (rng() - 0.5) * rect.w * 0.4,
        y: rect.y + rect.h / 2 + (rng() - 0.5) * rect.h * 0.4,
        opened: false,
      })
    }
  }

  // 4) Extra chests in wilderness
  while (chests.length < CHEST_SPAWN_COUNT) {
    const cx = 100 + rng() * (MAP_WIDTH - 200)
    const cy = 100 + rng() * (MAP_HEIGHT - 200)
    const tx = Math.floor(cx / TILE_SIZE)
    const ty = Math.floor(cy / TILE_SIZE)
    if (tx >= 0 && tx < MAP_TILES_X && ty >= 0 && ty < MAP_TILES_Y) {
      const t = tiles[ty * MAP_TILES_X + tx]
      if (t === TileType.Grass || t === TileType.Sand) {
        chests.push({ x: cx, y: cy, opened: false })
      }
    }
  }

  // 5) Trees
  const treeCount = 400
  for (let i = 0; i < treeCount; i++) {
    const tx = 50 + rng() * (MAP_WIDTH - 100)
    const ty = 50 + rng() * (MAP_HEIGHT - 100)
    const tileX = Math.floor(tx / TILE_SIZE)
    const tileY = Math.floor(ty / TILE_SIZE)
    if (tileX >= 0 && tileX < MAP_TILES_X && tileY >= 0 && tileY < MAP_TILES_Y) {
      const t = tiles[tileY * MAP_TILES_X + tileX]
      if (t === TileType.Grass) {
        trees.push({ x: tx, y: ty, health: 100 })
      }
    }
  }

  // 6) Rocks
  const rockCount = 120
  for (let i = 0; i < rockCount; i++) {
    const rx = 50 + rng() * (MAP_WIDTH - 100)
    const ry = 50 + rng() * (MAP_HEIGHT - 100)
    const tileX = Math.floor(rx / TILE_SIZE)
    const tileY = Math.floor(ry / TILE_SIZE)
    if (tileX >= 0 && tileX < MAP_TILES_X && tileY >= 0 && tileY < MAP_TILES_Y) {
      const t = tiles[tileY * MAP_TILES_X + tileX]
      if (t === TileType.Grass || t === TileType.Sand) {
        rocks.push({ x: rx, y: ry, health: 150 })
      }
    }
  }

  // 7) Floor loot
  const weaponIds = ['ar', 'shotgun', 'smg', 'sniper']
  const rarities = ['common', 'uncommon', 'rare', 'epic', 'legendary']
  for (let i = 0; i < FLOOR_LOOT_COUNT; i++) {
    const lx = 100 + rng() * (MAP_WIDTH - 200)
    const ly = 100 + rng() * (MAP_HEIGHT - 200)
    const r = rng()
    const rarityIdx = r < 0.35 ? 0 : r < 0.60 ? 1 : r < 0.80 ? 2 : r < 0.95 ? 3 : 4
    floorLoot.push({
      x: lx, y: ly,
      weaponId: weaponIds[Math.floor(rng() * weaponIds.length)],
      rarity: rarities[rarityIdx],
      picked: false,
    })
  }

  return {
    tiles, trees, rocks, chests, floorLoot,
    buildings, playerBuilds: [], wallColliders, poiLabels,
  }
}

// ── Render Map ──────────────────────────────────────────────────────────────

export function renderMap(ctx: CanvasRenderingContext2D, map: GameMap, cam: Camera) {
  const startTX = Math.max(0, Math.floor(cam.x / TILE_SIZE) - 1)
  const startTY = Math.max(0, Math.floor(cam.y / TILE_SIZE) - 1)
  const endTX = Math.min(MAP_TILES_X, Math.ceil((cam.x + cam.width) / TILE_SIZE) + 1)
  const endTY = Math.min(MAP_TILES_Y, Math.ceil((cam.y + cam.height) / TILE_SIZE) + 1)

  // Tiles
  for (let ty = startTY; ty < endTY; ty++) {
    for (let tx = startTX; tx < endTX; tx++) {
      const tile = map.tiles[ty * MAP_TILES_X + tx]
      const sx = tx * TILE_SIZE - cam.x
      const sy = ty * TILE_SIZE - cam.y

      switch (tile) {
        case TileType.Grass:
          ctx.fillStyle = (tx + ty) % 2 === 0 ? COLORS.grass : COLORS.grassDark
          break
        case TileType.Sand:
          ctx.fillStyle = COLORS.sand
          break
        case TileType.Water:
          ctx.fillStyle = (tx + ty) % 3 === 0 ? COLORS.water : COLORS.waterDark
          break
        case TileType.Road:
          ctx.fillStyle = COLORS.road
          break
        case TileType.BuildingFloor:
          ctx.fillStyle = '#9a8a7a'
          break
        default:
          ctx.fillStyle = COLORS.grass
      }
      ctx.fillRect(sx, sy, TILE_SIZE + 1, TILE_SIZE + 1)
    }
  }

  // Building walls
  for (const b of map.buildings) {
    const sx = b.x - cam.x
    const sy = b.y - cam.y
    if (sx + b.w < -10 || sx > cam.width + 10 || sy + b.h < -10 || sy > cam.height + 10) continue

    ctx.strokeStyle = COLORS.buildingDark
    ctx.lineWidth = 4
    ctx.strokeRect(sx, sy, b.w, b.h)

    // Door opening
    if (b.hasDoor) {
      ctx.fillStyle = '#9a8a7a'
      const dw = TILE_SIZE * 1.5
      switch (b.doorSide) {
        case 'n':
          ctx.fillRect(sx + b.w / 2 - dw / 2, sy - 2, dw, 8)
          break
        case 's':
          ctx.fillRect(sx + b.w / 2 - dw / 2, sy + b.h - 6, dw, 8)
          break
        case 'w':
          ctx.fillRect(sx - 2, sy + b.h / 2 - dw / 2, 8, dw)
          break
        case 'e':
          ctx.fillRect(sx + b.w - 6, sy + b.h / 2 - dw / 2, 8, dw)
          break
      }
    }
  }

  // Player builds
  for (const pb of map.playerBuilds) {
    const sx = pb.x - cam.x
    const sy = pb.y - cam.y
    if (sx + pb.w < -10 || sx > cam.width + 10 || sy + pb.h < -10 || sy > cam.height + 10) continue
    drawBuildPiece(ctx, sx, sy, pb.w, pb.h, pb.material, pb.health, pb.maxHealth)
  }

  // Trees
  for (const t of map.trees) {
    if (t.health <= 0) continue
    const sx = t.x - cam.x
    const sy = t.y - cam.y
    if (sx < -20 || sx > cam.width + 20 || sy < -20 || sy > cam.height + 20) continue
    drawTree(ctx, sx, sy)
  }

  // Rocks
  for (const r of map.rocks) {
    if (r.health <= 0) continue
    const sx = r.x - cam.x
    const sy = r.y - cam.y
    if (sx < -20 || sx > cam.width + 20 || sy < -20 || sy > cam.height + 20) continue
    drawRock(ctx, sx, sy)
  }

  // Chests
  for (const c of map.chests) {
    const sx = c.x - cam.x
    const sy = c.y - cam.y
    if (sx < -30 || sx > cam.width + 30 || sy < -30 || sy > cam.height + 30) continue
    drawChest(ctx, sx, sy, c.opened)
  }

  // POI Labels
  ctx.font = 'bold 12px monospace'
  ctx.textAlign = 'center'
  for (const label of map.poiLabels) {
    const sx = label.x - cam.x
    const sy = label.y - cam.y
    if (sx < -100 || sx > cam.width + 100 || sy < -20 || sy > cam.height + 20) continue
    ctx.fillStyle = 'rgba(0,0,0,0.6)'
    const w = ctx.measureText(label.name).width + 8
    ctx.fillRect(sx - w / 2, sy - 10, w, 16)
    ctx.fillStyle = '#fff'
    ctx.fillText(label.name, sx, sy + 2)
  }
}

// ── Get tree/rock colliders near a point ────────────────────────────────────

export function getEnvironmentColliders(map: GameMap, x: number, y: number, range: number): AABB[] {
  const colliders: AABB[] = []
  for (const t of map.trees) {
    if (t.health <= 0) continue
    if (Math.abs(t.x - x) < range && Math.abs(t.y - y) < range) {
      colliders.push({ x: t.x - 8, y: t.y - 6, w: 16, h: 16 })
    }
  }
  for (const r of map.rocks) {
    if (r.health <= 0) continue
    if (Math.abs(r.x - x) < range && Math.abs(r.y - y) < range) {
      colliders.push({ x: r.x - 10, y: r.y - 8, w: 20, h: 16 })
    }
  }
  return colliders
}
