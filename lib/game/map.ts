// ── Map Generation ──────────────────────────────────────────────────────────

import {
  TILE_SIZE, MAP_TILES_X, MAP_TILES_Y, MAP_WIDTH, MAP_HEIGHT,
  POI_DEFS, CHEST_SPAWN_COUNT, AMMO_BOX_SPAWN_COUNT, FLOOR_LOOT_COUNT, COLORS, MINIMAP_SIZE,
  CONSUMABLE_LOOT_RARITY,
  RARE_CHEST_APPEAR_RATE, CHEST_BUILDING_SPAWN_WEIGHT, AMMO_BOX_BUILDING_SPAWN_WEIGHT,
  type BuildMaterial, type BuildPieceId,
  type Rarity, type ConsumableId, type ContainerType,
} from './constants'
import { drawTree, drawRock, drawCar, drawContainer, drawBuildPiece } from './sprites'
import { type AABB, SpatialGridRef } from './collision'
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
  kind: 'tree'
  x: number; y: number
  health: number
}

export interface RockObj {
  kind: 'rock'
  x: number; y: number
  health: number
}

export interface CarObj {
  kind: 'car'
  x: number; y: number
  health: number
}

export type EnvObj = TreeObj | RockObj | CarObj

export interface ContainerObj {
  id: number
  x: number; y: number
  opened: boolean
  pendingVerification: boolean
  type: ContainerType
  spawnArea: 'building' | 'wild'
}

interface FloorLootBase {
  x: number; y: number
  rarity: Rarity
  picked: boolean
}

export interface WeaponFloorLoot extends FloorLootBase {
  kind: 'weapon'
  weaponId: string
}

export interface ConsumableFloorLoot extends FloorLootBase {
  kind: 'consumable'
  itemId: ConsumableId
}

export interface AmmoFloorLoot extends FloorLootBase {
  kind: 'ammo'
  amount: number
  weaponId?: string
}

export type FloorLoot = WeaponFloorLoot | ConsumableFloorLoot | AmmoFloorLoot

export interface BuildingRect extends AABB {
  hasDoor: boolean
  doorSide: 'n' | 's' | 'e' | 'w'
}

export interface PlayerBuild extends AABB {
  material: BuildMaterial
  pieceId: BuildPieceId
  rotation: 0 | 1
  blocksMovement: boolean
  blocksProjectiles: boolean
  health: number
  maxHealth: number
}

// ── GameMap ─────────────────────────────────────────────────────────────────

export interface GameMap {
  seed: number
  tiles: Uint8Array
  trees: TreeObj[]
  rocks: RockObj[]
  cars: CarObj[]
  containers: ContainerObj[]
  floorLoot: FloorLoot[]
  buildings: BuildingRect[]
  playerBuilds: PlayerBuild[]
  wallColliders: AABB[]
  envGrid: SpatialGridRef<EnvObj>
  structureGrid: SpatialGridRef<AABB | PlayerBuild>
  poiLabels: { name: string; x: number; y: number }[]
  minimapCanvas: HTMLCanvasElement | null
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

function randomChestContainerType(rng: () => number): ContainerType {
  return rng() < RARE_CHEST_APPEAR_RATE ? 'rare_chest' : 'chest'
}

function isContainerTooClose(containers: ContainerObj[], x: number, y: number, minDistance: number): boolean {
  const minDistSq = minDistance * minDistance
  for (const container of containers) {
    const dx = container.x - x
    const dy = container.y - y
    if (dx * dx + dy * dy < minDistSq) return true
  }
  return false
}

// ── Generate ────────────────────────────────────────────────────────────────

export function generateMap(seed = 42): GameMap {
  const rng = seededRandom(seed)
  const tiles = new Uint8Array(MAP_TILES_X * MAP_TILES_Y)
  const trees: TreeObj[] = []
  const rocks: RockObj[] = []
  const cars: CarObj[] = []
  const containers: ContainerObj[] = []
  const floorLoot: FloorLoot[] = []
  const buildings: BuildingRect[] = []
  const playerBuilds: PlayerBuild[] = []
  const wallColliders: AABB[] = []
  const poiLabels: { name: string; x: number; y: number }[] = []
  const buildingChestSpots: Array<{ x: number; y: number }> = []
  const buildingAmmoSpots: Array<{ x: number; y: number }> = []
  let nextContainerId = 1

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

      // Candidate chest spawn inside building
      buildingChestSpots.push({
        x: rect.x + rect.w / 2 + (rng() - 0.5) * rect.w * 0.4,
        y: rect.y + rect.h / 2 + (rng() - 0.5) * rect.h * 0.4,
      })
      buildingAmmoSpots.push({
        x: rect.x + rect.w * (0.25 + rng() * 0.5),
        y: rect.y + rect.h * (0.25 + rng() * 0.5),
      })
    }
  }

  // 4) Chest pass (weighted toward buildings, with wild fallback)
  let chestCount = 0
  let chestAttempts = 0
  const maxChestAttempts = CHEST_SPAWN_COUNT * 20
  while (chestCount < CHEST_SPAWN_COUNT && chestAttempts < maxChestAttempts) {
    chestAttempts++
    const shouldUseBuilding = buildingChestSpots.length > 0
      && (rng() < CHEST_BUILDING_SPAWN_WEIGHT || chestAttempts > maxChestAttempts * 0.75)

    if (shouldUseBuilding) {
      const idx = Math.floor(rng() * buildingChestSpots.length)
      const spot = buildingChestSpots.splice(idx, 1)[0]
      if (!isContainerTooClose(containers, spot.x, spot.y, 42)) {
        containers.push({
          id: nextContainerId++,
          x: spot.x,
          y: spot.y,
          opened: false,
          pendingVerification: false,
          type: randomChestContainerType(rng),
          spawnArea: 'building',
        })
        chestCount++
      }
      continue
    }

    const cx = 100 + rng() * (MAP_WIDTH - 200)
    const cy = 100 + rng() * (MAP_HEIGHT - 200)
    const tx = Math.floor(cx / TILE_SIZE)
    const ty = Math.floor(cy / TILE_SIZE)
    if (tx < 0 || tx >= MAP_TILES_X || ty < 0 || ty >= MAP_TILES_Y) continue
    const tile = tiles[ty * MAP_TILES_X + tx]
    if (tile !== TileType.Grass && tile !== TileType.Sand && tile !== TileType.BuildingFloor) continue
    if (isContainerTooClose(containers, cx, cy, 42)) continue

    containers.push({
      id: nextContainerId++,
      x: cx,
      y: cy,
      opened: false,
      pendingVerification: false,
      type: randomChestContainerType(rng),
      spawnArea: 'wild',
    })
    chestCount++
  }

  while (chestCount < CHEST_SPAWN_COUNT) {
    const cx = 100 + rng() * (MAP_WIDTH - 200)
    const cy = 100 + rng() * (MAP_HEIGHT - 200)
    containers.push({
      id: nextContainerId++,
      x: cx,
      y: cy,
      opened: false,
      pendingVerification: false,
      type: randomChestContainerType(rng),
      spawnArea: 'wild',
    })
    chestCount++
  }

  // 5) Ammo box pass
  let ammoCount = 0
  let ammoAttempts = 0
  const maxAmmoAttempts = AMMO_BOX_SPAWN_COUNT * 20
  while (ammoCount < AMMO_BOX_SPAWN_COUNT && ammoAttempts < maxAmmoAttempts) {
    ammoAttempts++
    const shouldUseBuilding = buildingAmmoSpots.length > 0
      && (rng() < AMMO_BOX_BUILDING_SPAWN_WEIGHT || ammoAttempts > maxAmmoAttempts * 0.75)

    if (shouldUseBuilding) {
      const idx = Math.floor(rng() * buildingAmmoSpots.length)
      const spot = buildingAmmoSpots.splice(idx, 1)[0]
      if (!isContainerTooClose(containers, spot.x, spot.y, 30)) {
        containers.push({
          id: nextContainerId++,
          x: spot.x,
          y: spot.y,
          opened: false,
          pendingVerification: false,
          type: 'ammo_box',
          spawnArea: 'building',
        })
        ammoCount++
      }
      continue
    }

    const ax = 100 + rng() * (MAP_WIDTH - 200)
    const ay = 100 + rng() * (MAP_HEIGHT - 200)
    const tx = Math.floor(ax / TILE_SIZE)
    const ty = Math.floor(ay / TILE_SIZE)
    if (tx < 0 || tx >= MAP_TILES_X || ty < 0 || ty >= MAP_TILES_Y) continue
    const tile = tiles[ty * MAP_TILES_X + tx]
    if (tile !== TileType.Grass && tile !== TileType.Sand && tile !== TileType.BuildingFloor) continue
    if (isContainerTooClose(containers, ax, ay, 30)) continue

    containers.push({
      id: nextContainerId++,
      x: ax,
      y: ay,
      opened: false,
      pendingVerification: false,
      type: 'ammo_box',
      spawnArea: 'wild',
    })
    ammoCount++
  }

  while (ammoCount < AMMO_BOX_SPAWN_COUNT) {
    const ax = 100 + rng() * (MAP_WIDTH - 200)
    const ay = 100 + rng() * (MAP_HEIGHT - 200)
    containers.push({
      id: nextContainerId++,
      x: ax,
      y: ay,
      opened: false,
      pendingVerification: false,
      type: 'ammo_box',
      spawnArea: 'wild',
    })
    ammoCount++
  }

  // 6) Trees
  const treeCount = 400
  for (let i = 0; i < treeCount; i++) {
    const tx = 50 + rng() * (MAP_WIDTH - 100)
    const ty = 50 + rng() * (MAP_HEIGHT - 100)
    const tileX = Math.floor(tx / TILE_SIZE)
    const tileY = Math.floor(ty / TILE_SIZE)
    if (tileX >= 0 && tileX < MAP_TILES_X && tileY >= 0 && tileY < MAP_TILES_Y) {
      const t = tiles[tileY * MAP_TILES_X + tileX]
      if (t === TileType.Grass) {
        trees.push({ kind: 'tree', x: tx, y: ty, health: 100 })
      }
    }
  }

  // 7) Rocks
  const rockCount = 120
  for (let i = 0; i < rockCount; i++) {
    const rx = 50 + rng() * (MAP_WIDTH - 100)
    const ry = 50 + rng() * (MAP_HEIGHT - 100)
    const tileX = Math.floor(rx / TILE_SIZE)
    const tileY = Math.floor(ry / TILE_SIZE)
    if (tileX >= 0 && tileX < MAP_TILES_X && tileY >= 0 && tileY < MAP_TILES_Y) {
      const t = tiles[tileY * MAP_TILES_X + tileX]
      if (t === TileType.Grass || t === TileType.Sand) {
        rocks.push({ kind: 'rock', x: rx, y: ry, health: 150 })
      }
    }
  }

  // 8) Cars (metal harvest)
  const carCount = 90
  for (let i = 0; i < carCount; i++) {
    const cx = 80 + rng() * (MAP_WIDTH - 160)
    const cy = 80 + rng() * (MAP_HEIGHT - 160)
    const tileX = Math.floor(cx / TILE_SIZE)
    const tileY = Math.floor(cy / TILE_SIZE)
    if (tileX < 0 || tileX >= MAP_TILES_X || tileY < 0 || tileY >= MAP_TILES_Y) continue
    const tile = tiles[tileY * MAP_TILES_X + tileX]
    if (tile === TileType.Road || tile === TileType.BuildingFloor || tile === TileType.Sand) {
      cars.push({ kind: 'car', x: cx, y: cy, health: 130 })
    }
  }

  // 9) Floor loot
  const weaponIds = ['ar', 'shotgun', 'smg', 'sniper'] as const
  const rarities: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary']
  for (let i = 0; i < FLOOR_LOOT_COUNT; i++) {
    const lx = 100 + rng() * (MAP_WIDTH - 200)
    const ly = 100 + rng() * (MAP_HEIGHT - 200)
    if (rng() < 0.65) {
      const r = rng()
      const rarityIdx = r < 0.35 ? 0 : r < 0.60 ? 1 : r < 0.80 ? 2 : r < 0.95 ? 3 : 4
      floorLoot.push({
        kind: 'weapon',
        x: lx, y: ly,
        weaponId: weaponIds[Math.floor(rng() * weaponIds.length)],
        rarity: rarities[rarityIdx],
        picked: false,
      })
      continue
    }

    const itemRoll = rng()
    const itemId: ConsumableId = itemRoll < 0.45
      ? 'bandage'
      : itemRoll < 0.75
        ? 'mini_shield'
        : itemRoll < 0.90
          ? 'shield_potion'
          : 'medkit'

    floorLoot.push({
      kind: 'consumable',
      x: lx,
      y: ly,
      itemId,
      rarity: CONSUMABLE_LOOT_RARITY[itemId],
      picked: false,
    })
  }

  const minimapCanvas = buildMinimapCanvas(tiles, buildings, trees, rocks, cars)
  const envGrid = buildEnvironmentGrid(trees, rocks, cars)
  const structureGrid = buildStructureGrid(wallColliders)

  return {
    seed,
    tiles, trees, rocks, cars, containers, floorLoot,
    buildings, playerBuilds, wallColliders, envGrid, structureGrid, poiLabels, minimapCanvas,
  }
}

// ── Minimap Pre-render ───────────────────────────────────────────────────────

function buildMinimapCanvas(
  tiles: Uint8Array,
  buildings: BuildingRect[],
  trees: TreeObj[],
  rocks: RockObj[],
  cars: CarObj[],
): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null
  const size = MINIMAP_SIZE
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const scale = size / MAP_WIDTH
  const tileW = size / MAP_TILES_X  // 1.6 px per tile
  const tileH = size / MAP_TILES_Y

  // Terrain tiles
  for (let ty = 0; ty < MAP_TILES_Y; ty++) {
    for (let tx = 0; tx < MAP_TILES_X; tx++) {
      const tile = tiles[ty * MAP_TILES_X + tx]
      switch (tile) {
        case TileType.Water:        ctx.fillStyle = '#2d63b0'; break
        case TileType.Sand:         ctx.fillStyle = '#c4a45a'; break
        case TileType.Road:         ctx.fillStyle = '#585858'; break
        case TileType.BuildingFloor:ctx.fillStyle = '#6b5d50'; break
        default:                    ctx.fillStyle = '#3d6934'; break // Grass
      }
      ctx.fillRect(
        Math.floor(tx * tileW), Math.floor(ty * tileH),
        Math.ceil(tileW) + 1,   Math.ceil(tileH) + 1,
      )
    }
  }

  // Buildings – slightly lighter roof tone so structures pop
  ctx.fillStyle = '#9e8e7e'
  for (const b of buildings) {
    ctx.fillRect(
      Math.floor(b.x * scale),  Math.floor(b.y * scale),
      Math.max(2, Math.ceil(b.w * scale)), Math.max(2, Math.ceil(b.h * scale)),
    )
  }

  // Trees – 1 px dark-green dots
  ctx.fillStyle = '#2a5019'
  for (const t of trees) {
    ctx.fillRect(Math.round(t.x * scale), Math.round(t.y * scale), 1, 1)
  }

  // Rocks – 1 px gray dots
  ctx.fillStyle = '#888'
  for (const r of rocks) {
    ctx.fillRect(Math.round(r.x * scale), Math.round(r.y * scale), 1, 1)
  }

  // Cars – 1 px slate-blue dots
  ctx.fillStyle = '#4a4a6a'
  for (const c of cars) {
    ctx.fillRect(Math.round(c.x * scale), Math.round(c.y * scale), 1, 1)
  }

  return canvas
}

// ── Render Map ──────────────────────────────────────────────────────────────

export function renderMap(
  ctx: CanvasRenderingContext2D,
  map: GameMap,
  cam: Camera,
  options?: { highlightedContainerId?: number | null; time?: number },
) {
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
    drawBuildPiece(ctx, sx, sy, pb.w, pb.h, pb.material, pb.pieceId, pb.rotation, pb.health, pb.maxHealth)
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

  // Cars
  for (const car of map.cars) {
    if (car.health <= 0) continue
    const sx = car.x - cam.x
    const sy = car.y - cam.y
    if (sx < -30 || sx > cam.width + 30 || sy < -30 || sy > cam.height + 30) continue
    drawCar(ctx, sx, sy, car.health / 130)
  }

  // Containers
  for (const c of map.containers) {
    const sx = c.x - cam.x
    const sy = c.y - cam.y
    if (sx < -30 || sx > cam.width + 30 || sy < -30 || sy > cam.height + 30) continue
    drawContainer(
      ctx,
      sx,
      sy,
      c.opened,
      c.pendingVerification,
      c.type,
      options?.highlightedContainerId === c.id,
      options?.time ?? 0,
    )
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

function buildEnvironmentGrid(trees: TreeObj[], rocks: RockObj[], cars: CarObj[]): SpatialGridRef<EnvObj> {
  const grid = new SpatialGridRef<EnvObj>(200)
  for (const tree of trees) grid.insertPoint(tree, tree.x, tree.y, 16)
  for (const rock of rocks) grid.insertPoint(rock, rock.x, rock.y, 16)
  for (const car of cars) grid.insertPoint(car, car.x, car.y, 24)
  return grid
}

function buildStructureGrid(wallColliders: AABB[]): SpatialGridRef<AABB | PlayerBuild> {
  const grid = new SpatialGridRef<AABB | PlayerBuild>(200)
  for (const wall of wallColliders) grid.insertAABB(wall, wall)
  return grid
}

export function getEnvironmentCollider(obj: EnvObj): AABB {
  switch (obj.kind) {
    case 'tree':
      return { x: obj.x - 8, y: obj.y - 6, w: 16, h: 16 }
    case 'rock':
      return { x: obj.x - 10, y: obj.y - 8, w: 20, h: 16 }
    case 'car':
      return { x: obj.x - 16, y: obj.y - 10, w: 32, h: 20 }
  }
}

export function getEnvironmentBuildOverlay(obj: EnvObj): AABB {
  switch (obj.kind) {
    case 'tree':
      return { x: obj.x - 10, y: obj.y - 10, w: 20, h: 20 }
    case 'rock':
      return { x: obj.x - 12, y: obj.y - 10, w: 24, h: 20 }
    case 'car':
      return { x: obj.x - 16, y: obj.y - 10, w: 32, h: 20 }
  }
}

function isEnvironmentCandidateInRange(obj: EnvObj, x: number, y: number, range: number): boolean {
  return Math.abs(obj.x - x) < range && Math.abs(obj.y - y) < range
}

function isStructureCandidateInRange(box: AABB, x: number, y: number, range: number): boolean {
  const centerX = box.x + box.w / 2
  const centerY = box.y + box.h / 2
  return Math.abs(centerX - x) < range && Math.abs(centerY - y) < range
}

export function getEnvironmentColliders(map: GameMap, x: number, y: number, range: number): AABB[] {
  const colliders: AABB[] = []
  for (const obj of map.envGrid.query(x, y, range)) {
    if (obj.health <= 0 || !isEnvironmentCandidateInRange(obj, x, y, range)) continue
    colliders.push(getEnvironmentCollider(obj))
  }
  return colliders
}

export function getStructureColliders(map: GameMap, x: number, y: number, range: number): AABB[] {
  const colliders: AABB[] = []
  for (const item of map.structureGrid.query(x, y, range)) {
    if ('health' in item) {
      if (!item.blocksMovement || item.health <= 0 || !isStructureCandidateInRange(item, x, y, range)) continue
      colliders.push(item)
      continue
    }
    if (!isStructureCandidateInRange(item, x, y, range)) continue
    colliders.push(item)
  }
  return colliders
}
