// ── AI Bot Logic ────────────────────────────────────────────────────────────

import {
  PLAYER_SIZE, PLAYER_SPEED, PLAYER_MAX_HEALTH, MAP_WIDTH, MAP_HEIGHT,
  WEAPONS, BOT_NAMES, RARITY_ORDER, type Rarity,
} from './constants'
import type { Player } from './player'
import { takeDamage } from './player'
import type { GameMap } from './map'
import { getEnvironmentColliders, getStructureColliders } from './map'
import type { StormState } from './storm'
import { isInStorm } from './storm'
import { distance, angleBetween, aabbOverlap, type AABB } from './collision'
import type { ParticleSystem } from './particles'
import { emitHitMarker, emitElimination } from './particles'

// ── Bot State ───────────────────────────────────────────────────────────────

type BotMode = 'loot' | 'move_to_zone' | 'fight' | 'build'

interface BotNavigationZone {
  centerX: number
  centerY: number
  radius: number
}

export interface Bot extends Player {
  mode: BotMode
  targetX: number
  targetY: number
  aiTimer: number
  fireAngle: number
  accuracy: number    // 0-1, higher = more accurate
  aggressiveness: number
  sightRange: number
  targetEntityId: number
}

export function createBot(id: number, x: number, y: number, teamId: number = 0): Bot {
  const name = BOT_NAMES[id % BOT_NAMES.length]
  const rarities: Rarity[] = ['common', 'uncommon', 'rare']
  const weaponIds = ['ar', 'shotgun', 'smg', 'sniper']
  const wepId = weaponIds[Math.floor(Math.random() * weaponIds.length)]
  const rarity = rarities[Math.floor(Math.random() * rarities.length)]
  const wep = WEAPONS[wepId]

  return {
    x, y, vx: 0, vy: 0,
    angle: 0,
    health: PLAYER_MAX_HEALTH,
    shield: Math.random() > 0.5 ? 50 : 0,
    alive: true,
    name,
    slots: [
      { weaponId: 'pickaxe', rarity: 'common' as Rarity, ammo: Infinity, maxAmmo: Infinity, reserveAmmo: Infinity },
      { weaponId: wepId, rarity, ammo: wep.magSize, maxAmmo: wep.magSize, reserveAmmo: Math.round(wep.magSize * 2.5) },
      null, null, null,
    ],
    activeSlot: 1,
    wood: 50 + Math.floor(Math.random() * 100),
    stone: 20 + Math.floor(Math.random() * 50),
    metal: 10 + Math.floor(Math.random() * 30),
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
    teamId,
    kills: 0,
    damageDealt: 0,
    itemsCollected: 0,
    mode: 'loot',
    targetX: x + (Math.random() - 0.5) * 400,
    targetY: y + (Math.random() - 0.5) * 400,
    aiTimer: 2 + Math.random() * 3,
    fireAngle: Math.random() * Math.PI * 2,
    accuracy: 0.3 + Math.random() * 0.5,
    aggressiveness: 0.3 + Math.random() * 0.6,
    sightRange: 300 + Math.random() * 200,
    targetEntityId: -1,
  }
}

function getBotNavigationZone(storm: StormState): BotNavigationZone {
  if (storm.shrinking) {
    return {
      centerX: storm.targetCenterX,
      centerY: storm.targetCenterY,
      radius: Math.max(0, storm.targetRadius),
    }
  }

  return {
    centerX: storm.centerX,
    centerY: storm.centerY,
    radius: Math.max(0, storm.currentRadius),
  }
}

function getBotNavigationRadius(radius: number): number {
  const safetyMargin = Math.min(160, Math.max(60, radius * 0.12))
  return Math.max(0, radius - safetyMargin)
}

function clampPointToZone(x: number, y: number, zone: BotNavigationZone): { x: number; y: number } {
  const safeRadius = getBotNavigationRadius(zone.radius)
  if (safeRadius <= 0) {
    return { x: zone.centerX, y: zone.centerY }
  }

  const dx = x - zone.centerX
  const dy = y - zone.centerY
  const dist = Math.hypot(dx, dy)
  if (dist <= safeRadius || dist === 0) {
    return { x, y }
  }

  const scale = safeRadius / dist
  return {
    x: zone.centerX + dx * scale,
    y: zone.centerY + dy * scale,
  }
}

function pickRandomZonePoint(zone: BotNavigationZone): { x: number; y: number } {
  const safeRadius = getBotNavigationRadius(zone.radius)
  if (safeRadius <= 0) {
    return { x: zone.centerX, y: zone.centerY }
  }

  const angle = Math.random() * Math.PI * 2
  const dist = Math.sqrt(Math.random()) * safeRadius
  return {
    x: zone.centerX + Math.cos(angle) * dist,
    y: zone.centerY + Math.sin(angle) * dist,
  }
}

function pickStormRetreatPoint(bot: Bot, zone: BotNavigationZone): { x: number; y: number } {
  const safeRadius = getBotNavigationRadius(zone.radius)
  if (safeRadius <= 0) {
    return { x: zone.centerX, y: zone.centerY }
  }

  const dx = bot.x - zone.centerX
  const dy = bot.y - zone.centerY
  const dist = Math.hypot(dx, dy)
  if (dist < 1) {
    return pickRandomZonePoint(zone)
  }

  const retreatRadius = Math.min(safeRadius * 0.65, Math.max(0, dist - 140))
  const scale = retreatRadius / dist
  return {
    x: zone.centerX + dx * scale,
    y: zone.centerY + dy * scale,
  }
}

function getStormPressure(x: number, y: number, zone: BotNavigationZone): number {
  const safeRadius = getBotNavigationRadius(zone.radius)
  if (safeRadius <= 0) return 1

  const distFromCenter = distance(x, y, zone.centerX, zone.centerY)
  if (distFromCenter >= safeRadius) return 1

  const warningRadius = Math.max(0, safeRadius - Math.max(100, safeRadius * 0.15))
  if (distFromCenter <= warningRadius) return 0

  return (distFromCenter - warningRadius) / Math.max(1, safeRadius - warningRadius)
}

// ── Update Bot AI ───────────────────────────────────────────────────────────

export function updateBot(
  bot: Bot,
  player: Player,
  allBots: Bot[],
  storm: StormState,
  map: GameMap,
  dt: number,
  now: number,
  ps: ParticleSystem,
): { fired: boolean; targetX: number; targetY: number } {
  if (!bot.alive) return { fired: false, targetX: 0, targetY: 0 }

  let fired = false
  bot.aiTimer -= dt
  const navigationZone = getBotNavigationZone(storm)
  const clampedTarget = clampPointToZone(bot.targetX, bot.targetY, navigationZone)
  bot.targetX = clampedTarget.x
  bot.targetY = clampedTarget.y
  const stormPressure = getStormPressure(bot.x, bot.y, navigationZone)
  const mustReturnToZone = isInStorm(storm, bot.x, bot.y) || stormPressure >= 0.9

  // Find nearest threat (player or other bot)
  let nearestThreat: Player | null = null
  let nearestDist = Infinity

  if (player.alive && player.teamId !== bot.teamId) {
    const d = distance(bot.x, bot.y, player.x, player.y)
    if (d < bot.sightRange) {
      nearestThreat = player
      nearestDist = d
    }
  }

  for (const other of allBots) {
    if (other === bot || !other.alive) continue
    if (other.teamId === bot.teamId) continue  // skip teammates
    const d = distance(bot.x, bot.y, other.x, other.y)
    if (d < bot.sightRange && d < nearestDist) {
      nearestThreat = other
      nearestDist = d
    }
  }

  // Mode selection
  if (mustReturnToZone) {
    bot.mode = 'move_to_zone'
    const retreatTarget = pickStormRetreatPoint(bot, navigationZone)
    bot.targetX = retreatTarget.x
    bot.targetY = retreatTarget.y
  } else if (bot.aiTimer <= 0) {
    bot.aiTimer = 1.5 + Math.random() * 2

    if (nearestThreat && nearestDist < bot.sightRange * bot.aggressiveness) {
      bot.mode = 'fight'
    } else {
      bot.mode = 'loot'
      const lootTarget = clampPointToZone(
        bot.x + (Math.random() - 0.5) * 300,
        bot.y + (Math.random() - 0.5) * 300,
        navigationZone,
      )
      bot.targetX = lootTarget.x
      bot.targetY = lootTarget.y
    }
  }

  // ── Execute mode ──────────────────────────────────────────────────────

  const speed = PLAYER_SPEED * 0.75 // Bots slightly slower

  const prevX = bot.x
  const prevY = bot.y

  switch (bot.mode) {
    case 'move_to_zone':
    case 'loot': {
      const distToTarget = distance(bot.x, bot.y, bot.targetX, bot.targetY)
      if (distToTarget > 20) {
        const angle = angleBetween(bot.x, bot.y, bot.targetX, bot.targetY)
        bot.x += Math.cos(angle) * speed * dt
        bot.y += Math.sin(angle) * speed * dt
        bot.angle = angle
      } else if (bot.mode === 'loot') {
        // Reached waypoint — pick a new one immediately instead of oscillating
        const lootTarget = clampPointToZone(
          bot.x + (Math.random() - 0.5) * 300,
          bot.y + (Math.random() - 0.5) * 300,
          navigationZone,
        )
        bot.targetX = lootTarget.x
        bot.targetY = lootTarget.y
      }

      // Pick up nearby floor loot
      for (const loot of map.floorLoot) {
        if (loot.picked) continue
        if (distance(bot.x, bot.y, loot.x, loot.y) < 30) {
          if (loot.kind !== 'weapon') continue
          loot.picked = true
          // Equip if better
          const slot = bot.slots[1]
          if (slot) {
            const currentRarityIdx = RARITY_ORDER.indexOf(slot.rarity)
            const newRarityIdx = RARITY_ORDER.indexOf(loot.rarity)
            if (newRarityIdx > currentRarityIdx) {
              const wep = WEAPONS[loot.weaponId]
              if (wep) {
                bot.slots[1] = {
                  weaponId: loot.weaponId,
                  rarity: loot.rarity,
                  ammo: wep.magSize,
                  maxAmmo: wep.magSize,
                  reserveAmmo: Math.round(wep.magSize * 3),
                }
              }
            }
          }
        }
      }

      break
    }

    case 'fight': {
      if (nearestThreat) {
        const trueAngle = angleBetween(bot.x, bot.y, nearestThreat.x, nearestThreat.y)
        bot.angle = trueAngle

        // Smooth aim tracking — bots don't instantly snap to the target
        const turnSpeed = 1.0 + bot.accuracy * 2.5 // rad/s; more accurate = faster tracking
        let aimDiff = trueAngle - bot.fireAngle
        while (aimDiff > Math.PI) aimDiff -= 2 * Math.PI
        while (aimDiff < -Math.PI) aimDiff += 2 * Math.PI
        const maxTurn = turnSpeed * dt
        bot.fireAngle += Math.sign(aimDiff) * Math.min(Math.abs(aimDiff), maxTurn)

        // Strafe while fighting
        const strafeAngle = bot.angle + Math.PI / 2 * (Math.sin(now * 2) > 0 ? 1 : -1)
        const retreatAngle = angleBetween(bot.x, bot.y, navigationZone.centerX, navigationZone.centerY)
        const chaseScale = nearestDist > 100 ? 0.5 * (1 - stormPressure) : 0
        const strafeScale = 0.3 * (1 - stormPressure)
        const retreatScale = stormPressure * 0.9
        bot.x += (
          Math.cos(bot.angle) * chaseScale
          + Math.cos(strafeAngle) * strafeScale
          + Math.cos(retreatAngle) * retreatScale
        ) * speed * dt
        bot.y += (
          Math.sin(bot.angle) * chaseScale
          + Math.sin(strafeAngle) * strafeScale
          + Math.sin(retreatAngle) * retreatScale
        ) * speed * dt

        // Fire
        bot.activeSlot = 1
        const slot = bot.slots[bot.activeSlot]
        if (slot) {
          const wep = WEAPONS[slot.weaponId]
          if (wep) {
            // Reload if empty
            if (slot.ammo <= 0 && slot.reserveAmmo > 0 && !bot.reloading) {
              bot.reloading = true
              bot.reloadStart = now
            }
            if (bot.reloading && now - bot.reloadStart >= wep.reloadTime) {
              const needed = slot.maxAmmo - slot.ammo
              const loaded = Math.max(0, Math.min(needed, slot.reserveAmmo))
              slot.ammo += loaded
              slot.reserveAmmo -= loaded
              bot.reloading = false
            }

            if (!bot.reloading && slot.ammo > 0) {
              const interval = 1 / wep.fireRate
              if (now - bot.lastFireTime >= interval) {
                bot.lastFireTime = now
                slot.ammo--
                fired = true
              }
            }
          }
        }
      }
      break
    }
  }

  // ── Collision with trees/rocks ────────────────────────────────────────
  const pSize = PLAYER_SIZE / 2
  const envColliders = getEnvironmentColliders(map, bot.x, bot.y, 100)
  const structureColliders = getStructureColliders(map, bot.x, bot.y, 260)
  for (const c of [...envColliders, ...structureColliders]) {
    const testX: AABB = { x: bot.x - pSize, y: prevY - pSize, w: PLAYER_SIZE, h: PLAYER_SIZE }
    if (aabbOverlap(testX, c)) bot.x = prevX

    const testY: AABB = { x: prevX - pSize, y: bot.y - pSize, w: PLAYER_SIZE, h: PLAYER_SIZE }
    if (aabbOverlap(testY, c)) bot.y = prevY
  }

  // Clamp position
  bot.x = Math.max(PLAYER_SIZE, Math.min(MAP_WIDTH - PLAYER_SIZE, bot.x))
  bot.y = Math.max(PLAYER_SIZE, Math.min(MAP_HEIGHT - PLAYER_SIZE, bot.y))

  // Storm damage (bypasses shield, hits health directly)
  if (isInStorm(storm, bot.x, bot.y)) {
    const dmg = storm.damagePerTick * dt * 2
    bot.health = Math.max(0, bot.health - dmg)
    if (bot.health <= 0) bot.alive = false
  }

  return {
    fired,
    targetX: nearestThreat?.x ?? bot.targetX,
    targetY: nearestThreat?.y ?? bot.targetY,
  }
}

// ── Process bot projectile hit ──────────────────────────────────────────────

export function processBotHit(
  target: Player | Bot,
  damage: number,
  ps: ParticleSystem,
): boolean {
  const { shieldDmg, healthDmg } = takeDamage(target, damage)
  if (shieldDmg > 0) emitHitMarker(ps, target.x, target.y, shieldDmg, true)
  if (healthDmg > 0) emitHitMarker(ps, target.x, target.y, healthDmg, false)
  if (!target.alive) {
    emitElimination(ps, target.x, target.y)
    return true
  }
  return false
}
