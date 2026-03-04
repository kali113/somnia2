// ── Player & Inventory ──────────────────────────────────────────────────────

import {
  PLAYER_SIZE, PLAYER_SPEED, PLAYER_MAX_HEALTH, PLAYER_MAX_SHIELD,
  WEAPONS, ITEMS, type WeaponDef, type Rarity, BUILDING_GRID, BUILDING_HEALTH,
  BUILD_PIECE_ORDER, BUILD_PIECES, BUILD_PLACE_RANGE,
  MAP_WIDTH, MAP_HEIGHT,
  type BuildMaterial, type BuildPieceId, type ConsumableId,
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
  reserveAmmo: number
}

export interface ActiveConsumableUse {
  itemId: ConsumableId
  startedAt: number
  endsAt: number
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
  buildMaterial: BuildMaterial
  buildPiece: BuildPieceId
  buildRotation: 0 | 1

  // Combat
  lastFireTime: number
  reloading: boolean
  reloadStart: number
  consumables: Record<ConsumableId, number>
  activeConsumableUse: ActiveConsumableUse | null

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
      { weaponId: 'pickaxe', rarity: 'common' as Rarity, ammo: Infinity, maxAmmo: Infinity, reserveAmmo: Infinity },
      null, null, null, null,
    ],
    activeSlot: 0,
    wood: 100,
    stone: 50,
    metal: 30,
    buildMode: false,
    buildMaterial: 'wood',
    buildPiece: 'wall',
    buildRotation: 0,
    lastFireTime: 0,
    reloading: false,
    reloadStart: 0,
    consumables: {
      medkit: 0,
      bandage: 0,
      shield_potion: 0,
      mini_shield: 0,
    },
    activeConsumableUse: null,
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

function getReserveMultiplier(rarity: Rarity): number {
  switch (rarity) {
    case 'common': return 2
    case 'uncommon': return 2.6
    case 'rare': return 3.2
    case 'epic': return 3.8
    case 'legendary': return 4.5
  }
}

function getPickupReserveAmmo(weaponId: string, rarity: Rarity): number {
  const weapon = WEAPONS[weaponId]
  if (!weapon || weapon.isMelee || !Number.isFinite(weapon.magSize)) return 0
  return Math.max(10, Math.round(weapon.magSize * getReserveMultiplier(rarity)))
}

export function addAmmoToPlayer(player: Player, amount: number, preferredWeaponId?: string): number {
  if (amount <= 0) return 0
  const candidateSlots: InventorySlot[] = []

  const pushSlot = (slot: InventorySlot | null) => {
    if (!slot) return
    const weapon = WEAPONS[slot.weaponId]
    if (!weapon || weapon.isMelee || !Number.isFinite(slot.reserveAmmo)) return
    candidateSlots.push(slot)
  }

  if (preferredWeaponId) {
    for (const slot of player.slots) {
      if (slot?.weaponId === preferredWeaponId) pushSlot(slot)
    }
  }

  for (const slot of player.slots) {
    if (slot && slot.weaponId !== preferredWeaponId) pushSlot(slot)
  }

  if (candidateSlots.length === 0) return 0

  const split = Math.max(1, Math.floor(amount / candidateSlots.length))
  let granted = 0
  for (let i = 0; i < candidateSlots.length; i++) {
    const slot = candidateSlots[i]
    const remaining = amount - granted
    if (remaining <= 0) break
    const bundle = i === candidateSlots.length - 1 ? remaining : Math.min(remaining, split)
    slot.reserveAmmo += bundle
    granted += bundle
  }

  return granted
}

function getConsumableCap(itemId: ConsumableId): number {
  if (itemId === 'bandage') return 75
  if (itemId === 'mini_shield') return 50
  return itemId === 'medkit' ? PLAYER_MAX_HEALTH : PLAYER_MAX_SHIELD
}

function getConsumableEffectiveAmount(player: Player, itemId: ConsumableId): number {
  const item = ITEMS[itemId]
  if (item.healAmount) {
    const cap = getConsumableCap(itemId)
    return Math.max(0, Math.min(item.healAmount, cap - player.health))
  }
  if (item.shieldAmount) {
    const cap = getConsumableCap(itemId)
    return Math.max(0, Math.min(item.shieldAmount, cap - player.shield))
  }
  return 0
}

export function canUseConsumable(player: Player, itemId: ConsumableId): boolean {
  if (!player.alive) return false
  if (player.consumables[itemId] <= 0) return false
  return getConsumableEffectiveAmount(player, itemId) > 0
}

export function selectBestConsumable(player: Player): ConsumableId | null {
  const healthItems: ConsumableId[] = ['bandage', 'medkit']
  const shieldItems: ConsumableId[] = ['mini_shield', 'shield_potion']
  const pickFrom = healthItems.some((id) => canUseConsumable(player, id))
    ? healthItems
    : shieldItems

  let best: ConsumableId | null = null
  let bestScore = -1
  let bestAmount = -1
  for (const itemId of pickFrom) {
    if (!canUseConsumable(player, itemId)) continue
    const item = ITEMS[itemId]
    const amount = getConsumableEffectiveAmount(player, itemId)
    const score = amount / item.useTime
    if (score > bestScore || (score === bestScore && amount > bestAmount)) {
      best = itemId
      bestScore = score
      bestAmount = amount
    }
  }
  return best
}

export function tryPickupConsumable(player: Player, itemId: ConsumableId): boolean {
  const item = ITEMS[itemId]
  const current = player.consumables[itemId]
  if (current >= item.maxStack) return false
  player.consumables[itemId] = current + 1
  player.itemsCollected++
  return true
}

export function startConsumableUse(player: Player, itemId: ConsumableId, now: number): boolean {
  if (player.activeConsumableUse) return false
  if (!canUseConsumable(player, itemId)) return false
  const item = ITEMS[itemId]
  player.activeConsumableUse = {
    itemId,
    startedAt: now,
    endsAt: now + item.useTime,
  }
  player.reloading = false
  return true
}

export function cancelConsumableUse(player: Player): boolean {
  if (!player.activeConsumableUse) return false
  player.activeConsumableUse = null
  return true
}

export function completeConsumableUseIfReady(
  player: Player,
  now: number,
): { itemId: ConsumableId; amount: number } | null {
  const active = player.activeConsumableUse
  if (!active || now < active.endsAt) return null
  player.activeConsumableUse = null

  const itemId = active.itemId
  if (player.consumables[itemId] <= 0) return null

  const amount = getConsumableEffectiveAmount(player, itemId)
  if (amount <= 0) return null

  const item = ITEMS[itemId]
  if (item.healAmount) {
    player.health = Math.min(getConsumableCap(itemId), player.health + amount)
  } else if (item.shieldAmount) {
    player.shield = Math.min(getConsumableCap(itemId), player.shield + amount)
  }

  player.consumables[itemId]--
  return { itemId, amount }
}

function getPieceSize(pieceId: BuildPieceId, rotation: 0 | 1): { w: number; h: number } {
  const def = BUILD_PIECES[pieceId]
  const rotate = rotation === 1 && def.gridW !== def.gridH
  const gridW = rotate ? def.gridH : def.gridW
  const gridH = rotate ? def.gridW : def.gridH
  return {
    w: gridW * BUILDING_GRID,
    h: gridH * BUILDING_GRID,
  }
}

function getBuildOverlay(map: GameMap): AABB[] {
  const overlay: AABB[] = []
  for (const t of map.trees) {
    if (t.health <= 0) continue
    overlay.push({ x: t.x - 10, y: t.y - 10, w: 20, h: 20 })
  }
  for (const r of map.rocks) {
    if (r.health <= 0) continue
    overlay.push({ x: r.x - 12, y: r.y - 10, w: 24, h: 20 })
  }
  for (const c of map.cars) {
    if (c.health <= 0) continue
    overlay.push({ x: c.x - 16, y: c.y - 10, w: 32, h: 20 })
  }
  return overlay
}

export interface BuildPlacement extends AABB {
  pieceId: BuildPieceId
  rotation: 0 | 1
  material: BuildMaterial
  cost: number
  blocksMovement: boolean
  blocksProjectiles: boolean
}

export function getBuildPlacement(player: Player, input: InputState): BuildPlacement {
  const piece = BUILD_PIECES[player.buildPiece]
  const size = getPieceSize(player.buildPiece, player.buildRotation)
  const gx = Math.floor((input.mouseWorldX - size.w / 2) / BUILDING_GRID) * BUILDING_GRID
  const gy = Math.floor((input.mouseWorldY - size.h / 2) / BUILDING_GRID) * BUILDING_GRID

  return {
    x: gx,
    y: gy,
    w: size.w,
    h: size.h,
    pieceId: player.buildPiece,
    rotation: player.buildRotation,
    material: player.buildMaterial,
    cost: piece.baseCost,
    blocksMovement: piece.blocksMovement,
    blocksProjectiles: piece.blocksProjectiles,
  }
}

export function canPlaceBuild(player: Player, map: GameMap, build: BuildPlacement): boolean {
  if (build.x < 0 || build.y < 0 || build.x + build.w > MAP_WIDTH || build.y + build.h > MAP_HEIGHT) {
    return false
  }

  const centerX = build.x + build.w / 2
  const centerY = build.y + build.h / 2
  const dx = centerX - player.x
  const dy = centerY - player.y
  if (dx * dx + dy * dy > BUILD_PLACE_RANGE * BUILD_PLACE_RANGE) {
    return false
  }

  for (const existing of map.playerBuilds) {
    if (aabbOverlap(build, existing)) return false
  }

  for (const wall of map.wallColliders) {
    if (aabbOverlap(build, wall)) return false
  }

  const blockedAreas = getBuildOverlay(map)
  for (const area of blockedAreas) {
    if (aabbOverlap(build, area)) return false
  }

  if (circleAABBOverlap(player.x, player.y, PLAYER_SIZE / 2, build)) {
    return false
  }

  return true
}

function cycleBuildPiece(player: Player, delta: number) {
  const idx = BUILD_PIECE_ORDER.indexOf(player.buildPiece)
  const next = (idx + delta + BUILD_PIECE_ORDER.length) % BUILD_PIECE_ORDER.length
  player.buildPiece = BUILD_PIECE_ORDER[next]
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
    if (player.buildMode) {
      cycleBuildPiece(player, Math.sign(input.scrollDelta))
    } else {
      let next = player.activeSlot + Math.sign(input.scrollDelta)
      if (next < 0) next = 4
      if (next > 4) next = 0
      player.activeSlot = next
      player.reloading = false
    }
  }

  // ── Build Mode ────────────────────────────────────────────────────────
  if (input.justPressed.has('b') || input.justPressed.has('q')) {
    player.buildMode = !player.buildMode
  }

  if (player.buildMode && input.justPressed.has('r')) {
    const mats: BuildMaterial[] = ['wood', 'stone', 'metal']
    const idx = mats.indexOf(player.buildMaterial)
    player.buildMaterial = mats[(idx + 1) % 3]
  }

  if (player.buildMode && input.justPressed.has('e')) {
    player.buildRotation = player.buildRotation === 0 ? 1 : 0
  }

  if (player.buildMode && input.justPressed.has('g')) {
    cycleBuildPiece(player, 1)
  }

  if (player.buildMode && input.justPressed.has('z')) player.buildPiece = 'wall'
  if (player.buildMode && input.justPressed.has('x')) player.buildPiece = 'barricade'
  if (player.buildMode && input.justPressed.has('c')) player.buildPiece = 'bunker'

  if (player.buildMode && input.justClicked) {
    const placement = getBuildPlacement(player, input)
    const mat = placement.material

    if (player[mat] >= placement.cost && canPlaceBuild(player, map, placement)) {
      player[mat] -= placement.cost
      const maxHealth = Math.round(BUILDING_HEALTH[mat] * BUILD_PIECES[placement.pieceId].healthMultiplier)
      const pb: PlayerBuild = {
        ...placement,
        health: maxHealth,
        maxHealth,
      }
      map.playerBuilds.push(pb)
      buildPlaced = true
    }
  }

  // ── Shooting ──────────────────────────────────────────────────────────
  if (!player.buildMode && input.mouseDown) {
    const weapon = getActiveWeapon(player)
    const slot = player.slots[player.activeSlot]
    if (weapon && slot && !player.reloading) {
      if (!weapon.isMelee && slot.ammo <= 0 && slot.reserveAmmo > 0) {
        player.reloading = true
        player.reloadStart = now
      } else {
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
  }

  // ── Reload ────────────────────────────────────────────────────────────
  if (input.justPressed.has('r') && !player.buildMode) {
    const weapon = getActiveWeapon(player)
    const slot = player.slots[player.activeSlot]
    if (
      weapon
      && slot
      && !weapon.isMelee
      && slot.ammo < slot.maxAmmo
      && slot.reserveAmmo > 0
      && !player.reloading
    ) {
      player.reloading = true
      player.reloadStart = now
    }
  }

  if (player.reloading) {
    const weapon = getActiveWeapon(player)
    const slot = player.slots[player.activeSlot]
    if (weapon && slot && now - player.reloadStart >= weapon.reloadTime) {
      const needed = slot.maxAmmo - slot.ammo
      const loaded = Math.max(0, Math.min(needed, slot.reserveAmmo))
      slot.ammo += loaded
      slot.reserveAmmo -= loaded
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
        reserveAmmo: getPickupReserveAmmo(weaponId, rarity),
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
      reserveAmmo: getPickupReserveAmmo(weaponId, rarity),
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
