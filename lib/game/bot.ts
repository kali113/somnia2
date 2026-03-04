// ── AI Bot Logic ────────────────────────────────────────────────────────────

import {
  PLAYER_SIZE, PLAYER_SPEED, PLAYER_MAX_HEALTH, MAP_WIDTH, MAP_HEIGHT,
  WEAPONS, BOT_NAMES, RARITY_ORDER, type Rarity,
} from './constants'
import type { Player, InventorySlot } from './player'
import { takeDamage } from './player'
import type { GameMap } from './map'
import type { StormState } from './storm'
import { isInStorm } from './storm'
import { distance, angleBetween } from './collision'
import type { ParticleSystem } from './particles'
import { emitHitMarker, emitElimination } from './particles'

// ── Bot State ───────────────────────────────────────────────────────────────

type BotMode = 'loot' | 'move_to_zone' | 'fight' | 'build'

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

export function createBot(id: number, x: number, y: number): Bot {
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
      { weaponId: 'pickaxe', rarity: 'common' as Rarity, ammo: Infinity, maxAmmo: Infinity },
      { weaponId: wepId, rarity, ammo: wep.magSize, maxAmmo: wep.magSize },
      null, null, null,
    ],
    activeSlot: 1,
    wood: 50 + Math.floor(Math.random() * 100),
    stone: 20 + Math.floor(Math.random() * 50),
    metal: 10 + Math.floor(Math.random() * 30),
    buildMode: false,
    buildMaterial: 'wood',
    lastFireTime: 0,
    reloading: false,
    reloadStart: 0,
    kills: 0,
    damageDealt: 0,
    itemsCollected: 0,
    mode: 'loot',
    targetX: x + (Math.random() - 0.5) * 400,
    targetY: y + (Math.random() - 0.5) * 400,
    aiTimer: 2 + Math.random() * 3,
    fireAngle: 0,
    accuracy: 0.3 + Math.random() * 0.5,
    aggressiveness: 0.3 + Math.random() * 0.6,
    sightRange: 300 + Math.random() * 200,
    targetEntityId: -1,
  }
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

  // Find nearest threat (player or other bot)
  let nearestThreat: Player | null = null
  let nearestDist = Infinity

  if (player.alive) {
    const d = distance(bot.x, bot.y, player.x, player.y)
    if (d < bot.sightRange) {
      nearestThreat = player
      nearestDist = d
    }
  }

  for (const other of allBots) {
    if (other === bot || !other.alive) continue
    const d = distance(bot.x, bot.y, other.x, other.y)
    if (d < bot.sightRange && d < nearestDist) {
      nearestThreat = other
      nearestDist = d
    }
  }

  // Mode selection
  if (bot.aiTimer <= 0) {
    bot.aiTimer = 1.5 + Math.random() * 2

    if (isInStorm(storm, bot.x, bot.y)) {
      bot.mode = 'move_to_zone'
      bot.targetX = storm.centerX + (Math.random() - 0.5) * storm.currentRadius * 0.5
      bot.targetY = storm.centerY + (Math.random() - 0.5) * storm.currentRadius * 0.5
    } else if (nearestThreat && nearestDist < bot.sightRange * bot.aggressiveness) {
      bot.mode = 'fight'
    } else {
      bot.mode = 'loot'
      bot.targetX = bot.x + (Math.random() - 0.5) * 300
      bot.targetY = bot.y + (Math.random() - 0.5) * 300
    }
  }

  // ── Execute mode ──────────────────────────────────────────────────────

  const speed = PLAYER_SPEED * 0.75 // Bots slightly slower

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
        bot.targetX = bot.x + (Math.random() - 0.5) * 300
        bot.targetY = bot.y + (Math.random() - 0.5) * 300
      }

      // Pick up nearby floor loot
      for (const loot of map.floorLoot) {
        if (loot.picked) continue
        if (distance(bot.x, bot.y, loot.x, loot.y) < 30) {
          loot.picked = true
          // Equip if better
          const slot = bot.slots[1]
          if (slot) {
            const currentRarityIdx = RARITY_ORDER.indexOf(slot.rarity as Rarity)
            const newRarityIdx = RARITY_ORDER.indexOf(loot.rarity as Rarity)
            if (newRarityIdx > currentRarityIdx) {
              const wep = WEAPONS[loot.weaponId]
              if (wep) {
                bot.slots[1] = {
                  weaponId: loot.weaponId,
                  rarity: loot.rarity as Rarity,
                  ammo: wep.magSize,
                  maxAmmo: wep.magSize,
                }
              }
            }
          }
        }
      }

      // Open nearby chests
      for (const chest of map.chests) {
        if (chest.opened) continue
        if (distance(bot.x, bot.y, chest.x, chest.y) < 40) {
          chest.opened = true
        }
      }
      break
    }

    case 'fight': {
      if (nearestThreat) {
        bot.angle = angleBetween(bot.x, bot.y, nearestThreat.x, nearestThreat.y)
        bot.fireAngle = bot.angle

        // Strafe while fighting
        const strafeAngle = bot.angle + Math.PI / 2 * (Math.sin(now * 2) > 0 ? 1 : -1)
        if (nearestDist > 100) {
          // Move toward target
          bot.x += Math.cos(bot.angle) * speed * 0.5 * dt
          bot.y += Math.sin(bot.angle) * speed * 0.5 * dt
        }
        bot.x += Math.cos(strafeAngle) * speed * 0.3 * dt
        bot.y += Math.sin(strafeAngle) * speed * 0.3 * dt

        // Fire
        bot.activeSlot = 1
        const slot = bot.slots[bot.activeSlot]
        if (slot) {
          const wep = WEAPONS[slot.weaponId]
          if (wep) {
            // Reload if empty
            if (slot.ammo <= 0 && !bot.reloading) {
              bot.reloading = true
              bot.reloadStart = now
            }
            if (bot.reloading && now - bot.reloadStart >= wep.reloadTime) {
              slot.ammo = slot.maxAmmo
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

  // Clamp position
  bot.x = Math.max(PLAYER_SIZE, Math.min(MAP_WIDTH - PLAYER_SIZE, bot.x))
  bot.y = Math.max(PLAYER_SIZE, Math.min(MAP_HEIGHT - PLAYER_SIZE, bot.y))

  // Storm damage
  if (isInStorm(storm, bot.x, bot.y)) {
    const dmg = storm.damagePerTick * dt * 2
    takeDamage(bot, dmg)
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
