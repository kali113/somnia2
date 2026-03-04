// ── Game Engine ─────────────────────────────────────────────────────────────

import {
  MAP_WIDTH, MAP_HEIGHT, PLAYER_SIZE, BOT_COUNT, COLORS,
  WEAPONS, MINIMAP_SIZE, MINIMAP_PADDING, MATERIAL_HARVEST, CONSUMABLE_LOOT_RARITY,
  type Rarity, type ConsumableId,
} from './constants'
import { createInputState, setupInput, clearFrameInput, updateMouseWorld, type InputState } from './input'
import { createCamera, updateCamera, resizeCamera, type Camera } from './camera'
import { generateMap, renderMap, getEnvironmentColliders, getStructureColliders, type GameMap } from './map'
import {
  createPlayer, updatePlayer, getActiveWeapon, tryPickupWeapon, tryPickupConsumable,
  takeDamage, getBuildPlacement, canPlaceBuild, selectBestConsumable,
  startConsumableUse, cancelConsumableUse, completeConsumableUseIfReady, type Player,
} from './player'
import { createBot, updateBot, processBotHit, type Bot } from './bot'
import { createStorm, updateStorm, isInStorm, renderStorm, renderStormMinimap, type StormState } from './storm'
import { createParticleSystem, updateParticles, renderParticles, emitSparks, emitHitMarker, emitElimination, type ParticleSystem } from './particles'
import { drawPlayer, drawBullet, drawLootItem, drawSupplyDrop, drawMinimapDot, drawBuildPiece as drawBuildPieceSprite } from './sprites'
import { distance, angleBetween, circleOverlap, type AABB } from './collision'
import { playShot, playHit, playElim, playChestOpen, playPickup, playBuild, playVictory, playEliminated, playSupplyDrop } from './audio'

// ── Projectile ──────────────────────────────────────────────────────────────

interface Projectile {
  x: number; y: number
  vx: number; vy: number
  angle: number
  damage: number
  ownerId: number    // -1 = player, 0+ = bot index
  life: number
  weaponId: string
}

// ── Supply Drop ─────────────────────────────────────────────────────────────

export interface SupplyDrop {
  x: number; y: number
  targetY: number
  falling: boolean
  opened: boolean
  rarity: Rarity
  spawnTime: number
}

// ── Kill Feed Entry ─────────────────────────────────────────────────────────

export interface KillFeedEntry {
  killer: string
  victim: string
  weapon: string
  time: number
}

// ── Game State ──────────────────────────────────────────────────────────────

export type GamePhase = 'lobby' | 'dropping' | 'playing' | 'victory' | 'eliminated'

export interface GameState {
  phase: GamePhase
  player: Player
  bots: Bot[]
  map: GameMap
  storm: StormState
  camera: Camera
  input: InputState
  particles: ParticleSystem
  projectiles: Projectile[]
  supplyDrops: SupplyDrop[]
  killFeed: KillFeedEntry[]
  aliveCount: number
  time: number
  placement: number
  lobbyTimer: number
  dropTimer: number

  // Callbacks for React UI
  onKillFeedUpdate?: (feed: KillFeedEntry[]) => void
  onAliveCountUpdate?: (count: number) => void
  onPhaseChange?: (phase: GamePhase) => void
  onPlayerUpdate?: (player: Player) => void
  onStormUpdate?: (storm: StormState) => void
  onSupplyDrop?: (drop: SupplyDrop) => void
}

// ── Initialize ──────────────────────────────────────────────────────────────

export function initGame(canvas: HTMLCanvasElement, options?: { botCount?: number }): GameState {
  const input = createInputState()
  const cleanup = setupInput(canvas, input)
  const botCount = Math.max(1, Math.floor(options?.botCount ?? BOT_COUNT))

  const camera = createCamera(canvas.width, canvas.height)
  const map = generateMap(Date.now() % 10000)

  // Spawn player at random land position
  const px = MAP_WIDTH * 0.3 + Math.random() * MAP_WIDTH * 0.4
  const py = MAP_HEIGHT * 0.3 + Math.random() * MAP_HEIGHT * 0.4
  const player = createPlayer(px, py, 'You')

  // Spawn bots
  const bots: Bot[] = []
  for (let i = 0; i < botCount; i++) {
    const bx = 200 + Math.random() * (MAP_WIDTH - 400)
    const by = 200 + Math.random() * (MAP_HEIGHT - 400)
    bots.push(createBot(i, bx, by))
  }

  camera.x = player.x - camera.width / 2
  camera.y = player.y - camera.height / 2

  const state: GameState = {
    phase: 'playing',
    player,
    bots,
    map,
    storm: createStorm(),
    camera,
    input,
    particles: createParticleSystem(),
    projectiles: [],
    supplyDrops: [],
    killFeed: [],
    aliveCount: botCount + 1,
    time: 0,
    placement: 0,
    lobbyTimer: 10,
    dropTimer: 0,
  }

  // Store cleanup on canvas for later
  ;(canvas as any).__gameCleanup = cleanup

  return state
}

function randomWeaponId(): string {
  const weaponIds = ['ar', 'shotgun', 'smg', 'sniper'] as const
  return weaponIds[Math.floor(Math.random() * weaponIds.length)]
}

function randomConsumableId(): ConsumableId {
  const roll = Math.random()
  if (roll < 0.45) return 'bandage'
  if (roll < 0.75) return 'mini_shield'
  if (roll < 0.90) return 'shield_potion'
  return 'medkit'
}

function actionCancelsConsumableUse(state: GameState): boolean {
  const { input, player } = state
  if (input.mouseDown) return true
  if (input.justPressed.has('r')) return true
  if (input.scrollDelta !== 0) return true
  for (let i = 1; i <= 5; i++) {
    if (input.justPressed.has(String(i))) return true
  }
  if (input.justPressed.has('b') || input.justPressed.has('q')) return true
  if (!player.buildMode) return false
  if (input.justClicked) return true
  if (input.justPressed.has('e') || input.justPressed.has('g')) return true
  if (input.justPressed.has('z') || input.justPressed.has('x') || input.justPressed.has('c')) return true
  return false
}

// ── Main Update ─────────────────────────────────────────────────────────────

export function updateGame(state: GameState, dt: number) {
  if (state.phase !== 'playing') return

  state.time += dt
  const now = state.time

  // Update camera first so mouse-to-world conversion matches this frame's render
  updateCamera(state.camera, state.player.x, state.player.y, dt)

  // Update mouse world coords
  updateMouseWorld(state.input, state.camera.x, state.camera.y)

  // ── Get colliders near player ─────────────────────────────────────────
  const envColliders = getEnvironmentColliders(state.map, state.player.x, state.player.y, 100)
  const structureColliders = getStructureColliders(state.map, state.player.x, state.player.y, 320)
  const allColliders: AABB[] = [
    ...structureColliders,
    ...envColliders,
  ]

  const cancelAction = actionCancelsConsumableUse(state)
  if (state.player.activeConsumableUse) {
    if (state.input.justPressed.has('f') || cancelAction) {
      cancelConsumableUse(state.player)
    }
  } else if (state.input.justPressed.has('f') && !state.player.buildMode && !cancelAction) {
    const itemId = selectBestConsumable(state.player)
    if (itemId) {
      startConsumableUse(state.player, itemId, now)
    }
  }

  // ── Update player ────────────────────────────────────────────────────
  const { fired, buildPlaced } = updatePlayer(
    state.player, state.input, dt, now, state.map, allColliders,
  )

  if (buildPlaced) playBuild()

  // ── Player shooting ──────────────────────────────────────────────────
  if (fired) {
    const weapon = getActiveWeapon(state.player)
    if (weapon) {
      playShot(weapon.id)
      if (weapon.isMelee) {
        // Melee hit check
        handleMeleeHit(state, state.player, -1)
      } else {
        const burstCount = weapon.burstCount ?? 1
        for (let b = 0; b < burstCount; b++) {
          const spread = (Math.random() - 0.5) * weapon.spread * 2
          const angle = state.player.angle + spread
          state.projectiles.push({
            x: state.player.x + Math.cos(angle) * (PLAYER_SIZE / 2 + 5),
            y: state.player.y + Math.sin(angle) * (PLAYER_SIZE / 2 + 5),
            vx: Math.cos(angle) * weapon.projectileSpeed,
            vy: Math.sin(angle) * weapon.projectileSpeed,
            angle,
            damage: weapon.damage,
            ownerId: -1,
            life: weapon.range / weapon.projectileSpeed,
            weaponId: weapon.id,
          })
        }
      }
    }
  }

  // ── Pickup floor loot / chests ────────────────────────────────────────
  for (const loot of state.map.floorLoot) {
    if (loot.picked) continue
    if (distance(state.player.x, state.player.y, loot.x, loot.y) < 30) {
      const picked = loot.kind === 'weapon'
        ? tryPickupWeapon(state.player, loot.weaponId, loot.rarity)
        : tryPickupConsumable(state.player, loot.itemId)
      if (picked) {
        loot.picked = true
        playPickup()
      }
    }
  }

  for (const chest of state.map.chests) {
    if (chest.opened) continue
    if (distance(state.player.x, state.player.y, chest.x, chest.y) < 35) {
      chest.opened = true
      playChestOpen()
      // Spawn loot near chest
      const rarities: Rarity[] = ['uncommon', 'rare', 'epic']
      const wId = randomWeaponId()
      const r = rarities[Math.floor(Math.random() * rarities.length)]
      state.map.floorLoot.push({
        kind: 'weapon',
        x: chest.x + (Math.random() - 0.5) * 30,
        y: chest.y + 20,
        weaponId: wId,
        rarity: r,
        picked: false,
      })
      const itemId = randomConsumableId()
      state.map.floorLoot.push({
        kind: 'consumable',
        x: chest.x + (Math.random() - 0.5) * 28,
        y: chest.y - 16,
        itemId,
        rarity: CONSUMABLE_LOOT_RARITY[itemId],
        picked: false,
      })
      // Add materials
      state.player.wood += 30
      state.player.stone += 20
    }
  }

  // ── Pickup supply drops ──────────────────────────────────────────────
  for (const drop of state.supplyDrops) {
    if (drop.opened || drop.falling) continue
    if (distance(state.player.x, state.player.y, drop.x, drop.y) < 30) {
      drop.opened = true
      playChestOpen()
      // Give legendary weapon
      const wId = randomWeaponId()
      tryPickupWeapon(state.player, wId, 'legendary')
      tryPickupConsumable(state.player, 'shield_potion')
      tryPickupConsumable(state.player, 'medkit')
      state.player.wood += 100
      state.player.stone += 100
      state.player.metal += 100
    }
  }

  // ── Update bots ──────────────────────────────────────────────────────
  for (let i = 0; i < state.bots.length; i++) {
    const bot = state.bots[i]
    if (!bot.alive) continue

    const result = updateBot(bot, state.player, state.bots, state.storm, state.map, dt, now, state.particles)

    if (result.fired) {
      const slot = bot.slots[bot.activeSlot]
      if (slot) {
        const wep = WEAPONS[slot.weaponId]
        if (wep && !wep.isMelee) {
          const inaccuracy = (1 - bot.accuracy) * 0.5
          const spread = (Math.random() - 0.5) * (wep.spread + inaccuracy) * 2
          const angle = bot.fireAngle + spread
          const burstCount = wep.burstCount ?? 1
          for (let b = 0; b < burstCount; b++) {
            const bSpread = spread + (Math.random() - 0.5) * wep.spread
            const bAngle = bot.fireAngle + bSpread
            state.projectiles.push({
              x: bot.x + Math.cos(bAngle) * (PLAYER_SIZE / 2 + 5),
              y: bot.y + Math.sin(bAngle) * (PLAYER_SIZE / 2 + 5),
              vx: Math.cos(bAngle) * wep.projectileSpeed,
              vy: Math.sin(bAngle) * wep.projectileSpeed,
              angle: bAngle,
              damage: wep.damage * 0.7,  // Bots deal slightly less damage
              ownerId: i,
              life: wep.range / wep.projectileSpeed,
              weaponId: wep.id,
            })
          }
        }
      }
    }
  }

  // ── Update projectiles ───────────────────────────────────────────────
  for (let i = state.projectiles.length - 1; i >= 0; i--) {
    const p = state.projectiles[i]
    p.x += p.vx * dt
    p.y += p.vy * dt
    p.life -= dt

    if (p.life <= 0 || p.x < 0 || p.x > MAP_WIDTH || p.y < 0 || p.y > MAP_HEIGHT) {
      state.projectiles.splice(i, 1)
      continue
    }

    // Hit player
    if (p.ownerId >= 0 && state.player.alive) {
      if (circleOverlap(p.x, p.y, 4, state.player.x, state.player.y, PLAYER_SIZE / 2)) {
        const { shieldDmg, healthDmg } = takeDamage(state.player, p.damage)
        if (shieldDmg > 0) emitHitMarker(state.particles, state.player.x, state.player.y, shieldDmg, true)
        if (healthDmg > 0) emitHitMarker(state.particles, state.player.x, state.player.y, healthDmg, false)
        if (shieldDmg > 0 || healthDmg > 0) {
          cancelConsumableUse(state.player)
        }
        playHit()
        state.projectiles.splice(i, 1)

        if (!state.player.alive) {
          emitElimination(state.particles, state.player.x, state.player.y)
          playEliminated()
          const killer = state.bots[p.ownerId]
          if (killer) {
            killer.kills++
            addKillFeed(state, killer.name, state.player.name, p.weaponId)
          }
          state.aliveCount--
          state.placement = state.aliveCount
          state.phase = 'eliminated'
          state.onPhaseChange?.('eliminated')
        }
        continue
      }
    }

    // Hit bots
    let projectileRemoved = false
    for (let j = 0; j < state.bots.length; j++) {
      const bot = state.bots[j]
      if (!bot.alive || j === p.ownerId) continue
      if (circleOverlap(p.x, p.y, 4, bot.x, bot.y, PLAYER_SIZE / 2)) {
        playHit()
        const eliminated = processBotHit(bot, p.damage, state.particles)
        state.projectiles.splice(i, 1)
        projectileRemoved = true

        if (eliminated) {
          playElim()
          state.aliveCount--
          state.onAliveCountUpdate?.(state.aliveCount)

          const killerName = p.ownerId === -1
            ? state.player.name
            : state.bots[p.ownerId]?.name ?? 'Unknown'

          if (p.ownerId === -1) {
            state.player.kills++
            state.onPlayerUpdate?.(state.player)
          } else if (state.bots[p.ownerId]) {
            state.bots[p.ownerId].kills++
          }

          addKillFeed(state, killerName, bot.name, p.weaponId)

          // Check victory
          if (state.aliveCount <= 1 && state.player.alive) {
            state.placement = 1
            state.phase = 'victory'
            state.onPhaseChange?.('victory')
            playVictory()
          }
        }
        break
      }
    }
    if (projectileRemoved) continue

    // Hit world structures
    let blockedByWall = false
    for (const wall of state.map.wallColliders) {
      if (p.x >= wall.x && p.x <= wall.x + wall.w && p.y >= wall.y && p.y <= wall.y + wall.h) {
        emitSparks(state.particles, p.x, p.y, 2, '#7b6a5a')
        state.projectiles.splice(i, 1)
        blockedByWall = true
        break
      }
    }
    if (blockedByWall) continue

    for (let j = state.map.playerBuilds.length - 1; j >= 0; j--) {
      const pb = state.map.playerBuilds[j]
      if (!pb.blocksProjectiles) continue
      if (p.x >= pb.x && p.x <= pb.x + pb.w && p.y >= pb.y && p.y <= pb.y + pb.h) {
        pb.health -= p.damage
        emitSparks(state.particles, p.x, p.y, 3, '#aaa')
        state.projectiles.splice(i, 1)
        if (pb.health <= 0) {
          state.map.playerBuilds.splice(j, 1)
        }
        break
      }
    }
  }

  // ── Update supply drops ──────────────────────────────────────────────
  for (const drop of state.supplyDrops) {
    if (drop.falling) {
      drop.y += 60 * dt
      if (drop.y >= drop.targetY) {
        drop.y = drop.targetY
        drop.falling = false
        playSupplyDrop()
      }
    }
  }

  // ── Storm damage to player ───────────────────────────────────────────
  if (state.player.alive && isInStorm(state.storm, state.player.x, state.player.y)) {
    const dmg = state.storm.damagePerTick * dt * 2
    const stormDamage = takeDamage(state.player, dmg)
    if (stormDamage.shieldDmg > 0 || stormDamage.healthDmg > 0) {
      cancelConsumableUse(state.player)
    }
    if (!state.player.alive) {
      emitElimination(state.particles, state.player.x, state.player.y)
      playEliminated()
      state.aliveCount--
      state.placement = state.aliveCount
      state.phase = 'eliminated'
      state.onPhaseChange?.('eliminated')
    }
  }

  const consumableResult = completeConsumableUseIfReady(state.player, now)
  if (consumableResult) {
    playPickup()
  }

  // ── Update storm ─────────────────────────────────────────────────────
  updateStorm(state.storm, dt)
  state.onStormUpdate?.(state.storm)

  // ── Update particles ─────────────────────────────────────────────────
  updateParticles(state.particles, dt)

  // ── Bot-on-bot kills (storm deaths etc.) ─────────────────────────────
  for (const bot of state.bots) {
    if (!bot.alive) continue
    if (bot.health <= 0) {
      bot.alive = false
      emitElimination(state.particles, bot.x, bot.y)
      state.aliveCount--
      addKillFeed(state, 'The Storm', bot.name, 'storm')

      if (state.aliveCount <= 1 && state.player.alive) {
        state.placement = 1
        state.phase = 'victory'
        state.onPhaseChange?.('victory')
        playVictory()
      }
    }
  }

  // Update React callbacks
  state.onPlayerUpdate?.(state.player)
  state.onAliveCountUpdate?.(state.aliveCount)

  // Clear frame input
  clearFrameInput(state.input)
}

// ── Handle melee ────────────────────────────────────────────────────────────

function handleMeleeHit(state: GameState, attacker: Player, attackerId: number) {
  const weapon = getActiveWeapon(attacker)
  if (!weapon) return

  // Check bots in melee range
  for (let i = 0; i < state.bots.length; i++) {
    const bot = state.bots[i]
    if (!bot.alive) continue
    const d = distance(attacker.x, attacker.y, bot.x, bot.y)
    const angle = angleBetween(attacker.x, attacker.y, bot.x, bot.y)
    const angleDiff = Math.abs(angle - attacker.angle)
    if (d < weapon.range && angleDiff < 1.0) {
      playHit()
      const eliminated = processBotHit(bot, weapon.damage, state.particles)
      harvestNearby(
        state,
        attacker.x + Math.cos(attacker.angle) * 40,
        attacker.y + Math.sin(attacker.angle) * 40,
        attacker,
      )

      if (eliminated) {
        playElim()
        state.aliveCount--
        if (attackerId === -1) {
          state.player.kills++
        }
        addKillFeed(state, attacker.name, bot.name, 'pickaxe')

        if (state.aliveCount <= 1 && state.player.alive) {
          state.placement = 1
          state.phase = 'victory'
          state.onPhaseChange?.('victory')
          playVictory()
        }
      }
      return
    }
  }

  // Harvest environment
  harvestNearby(state, attacker.x + Math.cos(attacker.angle) * 40, attacker.y + Math.sin(attacker.angle) * 40, attacker)
}

function harvestNearby(state: GameState, x: number, y: number, player: Player) {
  type HarvestTarget =
    | { kind: 'tree'; index: number; dist: number }
    | { kind: 'rock'; index: number; dist: number }
    | { kind: 'car'; index: number; dist: number }
    | { kind: 'build'; index: number; dist: number }

  let best: HarvestTarget | null = null
  const updateBest = (candidate: HarvestTarget) => {
    if (!best || candidate.dist < best.dist) best = candidate
  }

  for (let i = 0; i < state.map.playerBuilds.length; i++) {
    const build = state.map.playerBuilds[i]
    const d = pointToAABBDistance(x, y, build)
    if (d <= 14) {
      updateBest({ kind: 'build', index: i, dist: d })
    }
  }

  for (let i = 0; i < state.map.trees.length; i++) {
    const tree = state.map.trees[i]
    const d = distance(x, y, tree.x, tree.y)
    if (d <= 26) {
      updateBest({ kind: 'tree', index: i, dist: d })
    }
  }

  for (let i = 0; i < state.map.rocks.length; i++) {
    const rock = state.map.rocks[i]
    const d = distance(x, y, rock.x, rock.y)
    if (d <= 28) {
      updateBest({ kind: 'rock', index: i, dist: d })
    }
  }

  for (let i = 0; i < state.map.cars.length; i++) {
    const car = state.map.cars[i]
    const d = distance(x, y, car.x, car.y)
    if (d <= 34) {
      updateBest({ kind: 'car', index: i, dist: d })
    }
  }

  if (!best) return

  if (best.kind === 'tree') {
    const tree = state.map.trees[best.index]
    if (!tree) return
    tree.health -= 40
    grantMaterials(player, { wood: 6, stone: 0, metal: 0 })
    emitSparks(state.particles, tree.x, tree.y, 4, '#6b4226')
    if (tree.health <= 0) {
      grantMaterials(player, { wood: MATERIAL_HARVEST.tree.wood - 12, stone: 0, metal: 0 })
      state.map.trees.splice(best.index, 1)
      emitSparks(state.particles, tree.x, tree.y, 10, '#2d5a1e')
    }
    return
  }

  if (best.kind === 'rock') {
    const rock = state.map.rocks[best.index]
    if (!rock) return
    rock.health -= 45
    grantMaterials(player, { wood: 0, stone: 6, metal: 0 })
    emitSparks(state.particles, rock.x, rock.y, 4, '#888')
    if (rock.health <= 0) {
      grantMaterials(player, { wood: 0, stone: MATERIAL_HARVEST.rock.stone - 12, metal: 0 })
      state.map.rocks.splice(best.index, 1)
      emitSparks(state.particles, rock.x, rock.y, 10, '#aaa')
    }
    return
  }

  if (best.kind === 'car') {
    const car = state.map.cars[best.index]
    if (!car) return
    car.health -= 45
    grantMaterials(player, { wood: 0, stone: 0, metal: 5 })
    emitSparks(state.particles, car.x, car.y, 5, '#8f9aa6')
    if (car.health <= 0) {
      grantMaterials(player, { wood: 0, stone: 0, metal: MATERIAL_HARVEST.car.metal - 10 })
      state.map.cars.splice(best.index, 1)
      emitSparks(state.particles, car.x, car.y, 12, '#d4dde8')
    }
    return
  }

  const build = state.map.playerBuilds[best.index]
  if (!build) return
  build.health -= 50
  grantMaterials(player, materialToReward(build.material, 2))
  emitSparks(state.particles, x, y, 4, '#b9c0c8')
  if (build.health <= 0) {
    grantMaterials(player, materialToReward(build.material, 8))
    state.map.playerBuilds.splice(best.index, 1)
    emitSparks(state.particles, x, y, 10, '#dde3ea')
  }
}

function pointToAABBDistance(px: number, py: number, box: AABB): number {
  const cx = Math.max(box.x, Math.min(px, box.x + box.w))
  const cy = Math.max(box.y, Math.min(py, box.y + box.h))
  const dx = px - cx
  const dy = py - cy
  return Math.sqrt(dx * dx + dy * dy)
}

function materialToReward(material: 'wood' | 'stone' | 'metal', amount: number) {
  return {
    wood: material === 'wood' ? amount : 0,
    stone: material === 'stone' ? amount : 0,
    metal: material === 'metal' ? amount : 0,
  }
}

function grantMaterials(player: Player, reward: { wood: number; stone: number; metal: number }) {
  player.wood += reward.wood
  player.stone += reward.stone
  player.metal += reward.metal
}

// ── Add Kill Feed Entry ─────────────────────────────────────────────────────

function addKillFeed(state: GameState, killer: string, victim: string, weapon: string) {
  const entry: KillFeedEntry = { killer, victim, weapon, time: state.time }
  state.killFeed.unshift(entry)
  if (state.killFeed.length > 8) state.killFeed.pop()
  state.onKillFeedUpdate?.([...state.killFeed])
}

// ── Add Supply Drop ─────────────────────────────────────────────────────────

export function addSupplyDrop(state: GameState, x: number, y: number, rarity: Rarity) {
  const drop: SupplyDrop = {
    x,
    y: y - 400,
    targetY: y,
    falling: true,
    opened: false,
    rarity,
    spawnTime: state.time,
  }
  state.supplyDrops.push(drop)
  state.onSupplyDrop?.(drop)
}

// ── Render ──────────────────────────────────────────────────────────────────

export function renderGame(ctx: CanvasRenderingContext2D, state: GameState) {
  const { camera: cam, player, bots, map, storm, particles, projectiles, supplyDrops } = state

  ctx.clearRect(0, 0, cam.width, cam.height)

  // ── Map ───────────────────────────────────────────────────────────────
  renderMap(ctx, map, cam)

  // ── Floor loot ────────────────────────────────────────────────────────
  for (const loot of map.floorLoot) {
    if (loot.picked) continue
    const sx = loot.x - cam.x
    const sy = loot.y - cam.y
    if (sx < -20 || sx > cam.width + 20 || sy < -20 || sy > cam.height + 20) continue
    drawLootItem(ctx, sx, sy, loot.rarity, loot.kind === 'weapon', state.time)
  }

  // ── Supply drops ──────────────────────────────────────────────────────
  for (const drop of supplyDrops) {
    if (drop.opened) continue
    const sx = drop.x - cam.x
    const sy = drop.y - cam.y
    if (sx < -30 || sx > cam.width + 30 || sy < -50 || sy > cam.height + 50) continue
    drawSupplyDrop(ctx, sx, sy, state.time, drop.falling)
  }

  // ── Bots ──────────────────────────────────────────────────────────────
  for (const bot of bots) {
    if (!bot.alive) continue
    const sx = bot.x - cam.x
    const sy = bot.y - cam.y
    if (sx < -30 || sx > cam.width + 30 || sy < -30 || sy > cam.height + 30) continue
    drawPlayer(ctx, sx, sy, bot.angle, COLORS.bot, COLORS.botOutline, PLAYER_SIZE, bot.health, bot.shield, bot.name, bot.alive)
  }

  // ── Player ────────────────────────────────────────────────────────────
  if (player.alive) {
    drawPlayer(
      ctx,
      player.x - cam.x,
      player.y - cam.y,
      player.angle,
      COLORS.player,
      COLORS.playerOutline,
      PLAYER_SIZE,
      player.health, player.shield,
      player.name, player.alive,
    )

    // Build mode preview
    if (player.buildMode) {
      const preview = getBuildPlacement(player, state.input)
      const canAfford = player[preview.material] >= preview.cost
      const canPlace = canAfford && canPlaceBuild(player, map, preview)
      drawBuildPieceSprite(
        ctx,
        preview.x - cam.x,
        preview.y - cam.y,
        preview.w,
        preview.h,
        preview.material,
        preview.pieceId,
        preview.rotation,
        100,
        100,
        true,
        canPlace,
      )
    }
  }

  // ── Projectiles ───────────────────────────────────────────────────────
  for (const p of projectiles) {
    const sx = p.x - cam.x
    const sy = p.y - cam.y
    if (sx < -10 || sx > cam.width + 10 || sy < -10 || sy > cam.height + 10) continue
    drawBullet(ctx, sx, sy, p.angle)
  }

  // ── Particles ─────────────────────────────────────────────────────────
  renderParticles(ctx, particles, cam)

  // ── Storm ─────────────────────────────────────────────────────────────
  renderStorm(ctx, storm, cam, state.time)

  // ── Crosshair ─────────────────────────────────────────────────────────
  if (player.alive && !player.buildMode) {
    const cx = state.input.mouseX
    const cy = state.input.mouseY
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(cx - 10, cy); ctx.lineTo(cx - 4, cy)
    ctx.moveTo(cx + 4, cy); ctx.lineTo(cx + 10, cy)
    ctx.moveTo(cx, cy - 10); ctx.lineTo(cx, cy - 4)
    ctx.moveTo(cx, cy + 4); ctx.lineTo(cx, cy + 10)
    ctx.stroke()
  } else if (player.buildMode) {
    const preview = getBuildPlacement(player, state.input)
    const valid = player[preview.material] >= preview.cost && canPlaceBuild(player, map, preview)
    ctx.strokeStyle = valid ? '#4cff4c' : '#ff6666'
    ctx.lineWidth = 2
    const cx = state.input.mouseX
    const cy = state.input.mouseY
    ctx.strokeRect(cx - 8, cy - 8, 16, 16)
  }

  // ── Minimap ───────────────────────────────────────────────────────────
  renderMinimap(ctx, state)
}

// ── Minimap ─────────────────────────────────────────────────────────────────

function renderMinimap(ctx: CanvasRenderingContext2D, state: GameState) {
  const mSize = MINIMAP_SIZE
  const mx = state.camera.width - mSize - MINIMAP_PADDING
  const my = MINIMAP_PADDING
  const scale = mSize / MAP_WIDTH
  const radius = mSize / 2
  const cx = mx + radius
  const cy = my + radius

  // Background
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'
  ctx.beginPath()
  ctx.arc(cx, cy, radius + 2, 0, Math.PI * 2)
  ctx.fill()

  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, Math.PI * 2)
  ctx.clip()

  ctx.fillStyle = '#2a5a2a'
  ctx.fillRect(mx, my, mSize, mSize)

  // Storm
  renderStormMinimap(ctx, state.storm, mx, my, mSize)

  // Supply drops
  for (const drop of state.supplyDrops) {
    if (drop.opened) continue
    drawMinimapDot(ctx, mx + drop.x * scale, my + drop.y * scale, COLORS.supplyDrop, 3)
  }

  // Bots (as small red dots)
  for (const bot of state.bots) {
    if (!bot.alive) continue
    drawMinimapDot(ctx, mx + bot.x * scale, my + bot.y * scale, COLORS.bot, 1.5)
  }

  // Player
  if (state.player.alive) {
    drawMinimapDot(ctx, mx + state.player.x * scale, my + state.player.y * scale, COLORS.player, 3)
  }

  ctx.restore()

  // Border
  ctx.strokeStyle = 'rgba(255,255,255,0.3)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.arc(cx, cy, radius + 1.5, 0, Math.PI * 2)
  ctx.stroke()
}

// ── Resize ──────────────────────────────────────────────────────────────────

export function resizeGame(state: GameState, width: number, height: number) {
  resizeCamera(state.camera, width, height)
}

// ── Cleanup ─────────────────────────────────────────────────────────────────

export function cleanupGame(canvas: HTMLCanvasElement) {
  const cleanup = (canvas as any).__gameCleanup
  if (typeof cleanup === 'function') cleanup()
}
