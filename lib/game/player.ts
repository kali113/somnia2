// ── Player & Inventory ──────────────────────────────────────────────────────

import {
  PLAYER_SIZE, PLAYER_SPEED, PLAYER_MAX_HEALTH, PLAYER_MAX_SHIELD,
  WEAPONS, type WeaponDef, type Rarity, BUILDING_GRID, BUILDING_HEALTH,
  MAP_WIDTH, MAP_HEIGHT,
} from './constants'
import type { InputState } from './input'
import type { GameMap, PlayerBuild } from './map'
import { aabbOverlap, circleAABBOverlap, type AABB } from './collision'

// ── Inventory Slot ──────────────────────────────────────────────────────────

export interface InventorySlot {
  weaponId: string
  rarity: Rarity
  ammo: number
  maxAmmo: number
}

// ── Player State ────────────────────────────────────────────────────────────

export interface Player {
  x: number
  y: number
  vx: number
  vy: number
  angle: number
  health: number
  shield: number
  alive: boolean
  name: string

  // Inventory
  slots: (InventorySlot | null)[]
  activeSlot: number

  // Materials
  wood: number
  stone: number
  metal: number

  // Building
  buildMode: boolean
  buildMaterial: 'wood' | 'stone' | 'metal'

  // Combat
  lastFireTime: number
  reloading: boolean
  reloadStart: number

  // Stats
  kills: number
  damageDealt: number
  itemsCollected: number
}

export function createPlayer(x: number, y: number, name: string): Player {
  return {
    x, y, vx: 0, vy: 0,
    angle: 0,
    health: PLAYER_MAX_HEALTH,
    shield: PLAYER_MAX_SHIELD / 2,  // Start with 50 shield
    alive: true,
    name,
    slots: [
      { weaponId: 'pickaxe', rarity: 'common' as Rarity, ammo: Infinity, maxAmmo: Infinity },
      null, null, null, null,
    ],
    activeSlot: 0,
    wood: 100,
    stone: 50,
    metal: 30,
    buildMode: false,
    buildMaterial: 'wood',
    lastFireTime: 0,
    reloading: false,
    reloadStart: 0,
    kills: 0,
    damageDealt: 0,
    itemsCollected: 0,
  }
}

// ── Get active weapon ───────────────────────────────────────────────────────

export function getActiveWeapon(player: Player): WeaponDef | null {
  const slot = player.slots[player.activeSlot]
  if (!slot) return null
  return WEAPONS[slot.weaponId] ?? null
}

// ── Update Player ───────────────────────────────────────────────────────────

export function updatePlayer(
  player: Player,
  input: InputState,
  dt: number,
  now: number,
  map: GameMap,
  allColliders: AABB[],
): { fired: boolean; buildPlaced: boolean } {
  if (!player.alive) return { fired: false, buildPlaced: false }

  let fired = false
  let buildPlaced = false

  // ── Movement ──────────────────────────────────────────────────────────
  let dx = 0, dy = 0
  if (input.keys.has('w') || input.keys.has('arrowup')) dy -= 1
  if (input.keys.has('s') || input.keys.has('arrowdown')) dy += 1
  if (input.keys.has('a') || input.keys.has('arrowleft')) dx -= 1
  if (input.keys.has('d') || input.keys.has('arrowright')) dx += 1

  if (dx !== 0 || dy !== 0) {
    const len = Math.sqrt(dx * dx + dy * dy)
    dx /= len
    dy /= len
  }

  const speed = PLAYER_SPEED * (player.buildMode ? 0.7 : 1)
  const newX = player.x + dx * speed * dt
  const newY = player.y + dy * speed * dt

  // Collision check
  const pSize = PLAYER_SIZE / 2
  const playerAABB: AABB = { x: newX - pSize, y: newY - pSize, w: PLAYER_SIZE, h: PLAYER_SIZE }

  let blockedX = false, blockedY = false

  for (const c of allColliders) {
    const testX: AABB = { x: newX - pSize, y: player.y - pSize, w: PLAYER_SIZE, h: PLAYER_SIZE }
    if (aabbOverlap(testX, c)) blockedX = true

    const testY: AABB = { x: player.x - pSize, y: newY - pSize, w: PLAYER_SIZE, h: PLAYER_SIZE }
    if (aabbOverlap(testY, c)) blockedY = true
  }

  if (!blockedX) player.x = Math.max(pSize, Math.min(MAP_WIDTH - pSize, newX))
  if (!blockedY) player.y = Math.max(pSize, Math.min(MAP_HEIGHT - pSize, newY))

  // ── Aim Angle ─────────────────────────────────────────────────────────
  player.angle = Math.atan2(
    input.mouseWorldY - player.y,
    input.mouseWorldX - player.x,
  )

  // ── Slot Switching ────────────────────────────────────────────────────
  for (let i = 0; i < 5; i++) {
    if (input.justPressed.has(String(i + 1))) {
      player.activeSlot = i
      player.reloading = false
      player.buildMode = false
    }
  }

  // Scroll wheel switching
  if (input.scrollDelta !== 0) {
    let next = player.activeSlot + Math.sign(input.scrollDelta)
    if (next < 0) next = 4
    if (next > 4) next = 0
    player.activeSlot = next
    player.reloading = false
  }

  // ── Build Mode ────────────────────────────────────────────────────────
  if (input.justPressed.has('b') || input.justPressed.has('q')) {
    player.buildMode = !player.buildMode
  }

  if (player.buildMode && input.justPressed.has('r')) {
    const mats = ['wood', 'stone', 'metal'] as const
    const idx = mats.indexOf(player.buildMaterial)
    player.buildMaterial = mats[(idx + 1) % 3]
  }

  if (player.buildMode && input.justClicked) {
    const gx = Math.floor(input.mouseWorldX / BUILDING_GRID) * BUILDING_GRID
    const gy = Math.floor(input.mouseWorldY / BUILDING_GRID) * BUILDING_GRID
    const cost = 10
    const mat = player.buildMaterial

    if (player[mat] >= cost) {
      // Check no overlap with existing builds
      const newBuild: AABB = { x: gx, y: gy, w: BUILDING_GRID, h: BUILDING_GRID }
      let canPlace = true
      for (const pb of map.playerBuilds) {
        if (aabbOverlap(newBuild, pb)) { canPlace = false; break }
      }
      // Don't place on self
      if (circleAABBOverlap(player.x, player.y, pSize, newBuild)) canPlace = false

      if (canPlace) {
        player[mat] -= cost
        const pb: PlayerBuild = {
          ...newBuild,
          material: mat,
          health: BUILDING_HEALTH[mat],
          maxHealth: BUILDING_HEALTH[mat],
        }
        map.playerBuilds.push(pb)
        map.wallColliders.push(pb)
        buildPlaced = true
      }
    }
  }

  // ── Shooting ──────────────────────────────────────────────────────────
  if (!player.buildMode && input.mouseDown) {
    const weapon = getActiveWeapon(player)
    const slot = player.slots[player.activeSlot]
    if (weapon && slot && !player.reloading) {
      const interval = 1 / weapon.fireRate
      if (now - player.lastFireTime >= interval && slot.ammo > 0) {
        player.lastFireTime = now
        if (!weapon.isMelee) {
          slot.ammo--
        }
        fired = true
      }
    }
  }

  // ── Reload ────────────────────────────────────────────────────────────
  if (input.justPressed.has('r') && !player.buildMode) {
    const weapon = getActiveWeapon(player)
    const slot = player.slots[player.activeSlot]
    if (weapon && slot && !weapon.isMelee && slot.ammo < slot.maxAmmo && !player.reloading) {
      player.reloading = true
      player.reloadStart = now
    }
  }

  if (player.reloading) {
    const weapon = getActiveWeapon(player)
    const slot = player.slots[player.activeSlot]
    if (weapon && slot && now - player.reloadStart >= weapon.reloadTime) {
      slot.ammo = slot.maxAmmo
      player.reloading = false
    }
  }

  return { fired, buildPlaced }
}

// ── Pick Up Loot ────────────────────────────────────────────────────────────

export function tryPickupWeapon(
  player: Player,
  weaponId: string,
  rarity: Rarity,
): boolean {
  // Find empty slot
  for (let i = 1; i < 5; i++) {
    if (!player.slots[i]) {
      const wep = WEAPONS[weaponId]
      if (!wep) return false
      player.slots[i] = {
        weaponId,
        rarity,
        ammo: wep.magSize,
        maxAmmo: wep.magSize,
      }
      player.activeSlot = i
      player.itemsCollected++
      return true
    }
  }

  // Replace current slot (if not pickaxe)
  if (player.activeSlot > 0) {
    const wep = WEAPONS[weaponId]
    if (!wep) return false
    player.slots[player.activeSlot] = {
      weaponId,
      rarity,
      ammo: wep.magSize,
      maxAmmo: wep.magSize,
    }
    player.itemsCollected++
    return true
  }

  return false
}

// ── Take Damage ─────────────────────────────────────────────────────────────

export function takeDamage(player: Player, amount: number): { shieldDmg: number; healthDmg: number } {
  let shieldDmg = 0
  let healthDmg = 0

  if (player.shield > 0) {
    shieldDmg = Math.min(player.shield, amount)
    player.shield -= shieldDmg
    amount -= shieldDmg
  }

  if (amount > 0) {
    healthDmg = Math.min(player.health, amount)
    player.health -= healthDmg
  }

  if (player.health <= 0) {
    player.health = 0
    player.alive = false
  }

  return { shieldDmg, healthDmg }
}
