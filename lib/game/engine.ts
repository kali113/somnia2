// ── Game Engine ─────────────────────────────────────────────────────────────

import {
  MAP_WIDTH, MAP_HEIGHT, PLAYER_SIZE, BOT_COUNT, COLORS,
  WEAPONS, MINIMAP_SIZE, MINIMAP_PADDING, MATERIAL_HARVEST, CONSUMABLE_LOOT_RARITY,
  CONTAINER_INTERACT_RANGE, CONTAINER_GLOW_RANGE, CONTAINER_SEARCH_TIME,
  POI_DEFS, TILE_SIZE,
  TEAM_SIZES,
  type Rarity, type ConsumableId, type ContainerType, type GameMode,
} from './constants'
import { createInputState, setupInput, clearFrameInput, updateMouseWorld, type InputState } from './input'
import { createCamera, updateCamera, resizeCamera, type Camera } from './camera'
import { generateMap, renderMap, getEnvironmentColliders, getStructureColliders, type ContainerObj, type GameMap } from './map'
import {
  createPlayer, updatePlayer, getActiveWeapon, tryPickupWeapon, tryPickupConsumable, addAmmoToPlayer,
  takeDamage, getBuildPlacement, canPlaceBuild, selectBestConsumable,
  startConsumableUse, cancelConsumableUse, completeConsumableUseIfReady, type Player,
} from './player'
import { createBot, updateBot, processBotHit, type Bot } from './bot'
import { createStorm, updateStorm, isInStorm, renderStorm, renderStormMinimap, type StormState } from './storm'
import { createParticleSystem, updateParticles, renderParticles, emitSparks, emitHitMarker, emitElimination, type ParticleSystem } from './particles'
import { drawPlayer, drawBullet, drawLootItem, drawAmmoPack, drawSupplyDrop, drawMinimapDot, drawBuildPiece as drawBuildPieceSprite } from './sprites'
import { distance, angleBetween, circleOverlap, type AABB } from './collision'
import { playShot, playHit, playElim, playChestOpen, playPickup, playBuild, playVictory, playEliminated, playSupplyDrop } from './audio'

// ── Aim Assist ──────────────────────────────────────────────────────────────

const AIM_ASSIST_RADIUS = 55    // screen-space pixels
const AIM_ASSIST_STRENGTH = 0.08 // fraction to pull toward target (0 = off, 1 = full snap)

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

export type ContainerPromptStatus = 'ready' | 'searching' | 'verifying'

export interface ContainerPromptState {
  key: 'E'
  containerType: ContainerType
  containerId: number
  status: ContainerPromptStatus
  progress: number
  searchTime: number
}

export interface ContainerVerificationRequest {
  gameId: number
  mapSeed: number
  containerId: number
  containerType: ContainerType
  seed: number
  playerNonce: number
}

export interface ContainerRewardBundle {
  mapSeed: number
  containerId: number
  containerType: ContainerType
  roll: number
  weaponId: string | null
  weaponRarity: Rarity | null
  ammoAmount: number
  ammoWeaponId: string | null
  consumableId: ConsumableId | null
  consumableAmount: number
  materials: { wood: number; stone: number; metal: number }
  verified: boolean
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
  mode: GameMode
  aliveCount: number
  aliveTeams: number
  time: number
  placement: number
  lobbyTimer: number
  dropTimer: number
  gameId: number
  verifiedContainers: boolean
  activeContainerId: number | null
  promptContainerId: number | null
  pendingContainerId: number | null
  searchContainerId: number | null
  searchContainerProgress: number
  searchNonce: number
  aimAssistBotIdx: number   // index into bots[], -1 if no target

  // Callbacks for React UI
  onKillFeedUpdate?: (feed: KillFeedEntry[]) => void
  onAliveCountUpdate?: (count: number) => void
  onPhaseChange?: (phase: GamePhase) => void
  onPlayerUpdate?: (player: Player) => void
  onStormUpdate?: (storm: StormState) => void
  onSupplyDrop?: (drop: SupplyDrop) => void
  onContainerPromptUpdate?: (prompt: ContainerPromptState | null) => void
  onContainerVerificationRequested?: (request: ContainerVerificationRequest) => void
  onContainerOpened?: (result: ContainerRewardBundle) => void
}

// ── Initialize ──────────────────────────────────────────────────────────────

export function initGame(canvas: HTMLCanvasElement, options?: {
  botCount?: number
  mapSeed?: number
  mode?: GameMode
  gameId?: number
  verifiedContainers?: boolean
}): GameState {
  const input = createInputState()
  const cleanup = setupInput(canvas, input)
  const botCount = Math.max(1, Math.floor(options?.botCount ?? BOT_COUNT))
  const mapSeed = Math.max(1, Math.floor(options?.mapSeed ?? (Date.now() % 1000000)))
  const mode: GameMode = options?.mode ?? 'solo'
  const teamSize = TEAM_SIZES[mode]

  const camera = createCamera(canvas.width, canvas.height)
  const map = generateMap(mapSeed)

  // Spawn player at random land position — always on team 0
  const px = MAP_WIDTH * 0.3 + Math.random() * MAP_WIDTH * 0.4
  const py = MAP_HEIGHT * 0.3 + Math.random() * MAP_HEIGHT * 0.4
  const player = createPlayer(px, py, 'You')
  player.teamId = 0

  // Spawn bots and assign teams
  // Team 0 fills first: bots 0..(teamSize-2) are teammates (teamId=0)
  // Remaining bots form their own teams
  const bots: Bot[] = []
  const teammateSlots = teamSize - 1  // how many bot teammates on team 0
  for (let i = 0; i < botCount; i++) {
    const bx = 200 + Math.random() * (MAP_WIDTH - 400)
    const by = 200 + Math.random() * (MAP_HEIGHT - 400)
    let botTeamId: number
    if (i < teammateSlots) {
      botTeamId = 0
    } else {
      // i - teammateSlots is the index among enemy bots
      const enemyIdx = i - teammateSlots
      botTeamId = Math.floor(enemyIdx / teamSize) + 1
    }
    bots.push(createBot(i, bx, by, botTeamId))
  }

  // Count total teams
  const totalTeams = mode === 'solo'
    ? botCount + 1
    : Math.ceil((botCount + 1) / teamSize)

  camera.x = player.x - camera.width / 2
  camera.y = player.y - camera.height / 2

  const state: GameState = {
    phase: 'playing',
    mode,
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
    aliveTeams: totalTeams,
    time: 0,
    placement: 0,
    lobbyTimer: 10,
    dropTimer: 0,
    gameId: Math.max(0, Math.floor(options?.gameId ?? 0)),
    verifiedContainers: options?.verifiedContainers ?? false,
    activeContainerId: null,
    promptContainerId: null,
    pendingContainerId: null,
    searchContainerId: null,
    searchContainerProgress: 0,
    searchNonce: 0,
    aimAssistBotIdx: -1,
  }

  // Store cleanup on canvas for later
  ;(canvas as any).__gameCleanup = cleanup

  return state
}

function randomWeaponId(): string {
  const weaponIds = ['ar', 'shotgun', 'smg', 'sniper'] as const
  return weaponIds[Math.floor(Math.random() * weaponIds.length)]
}

function weightedPick<T>(options: Array<{ value: T; weight: number }>): T {
  const total = options.reduce((sum, option) => sum + option.weight, 0)
  let roll = Math.random() * total
  for (const option of options) {
    roll -= option.weight
    if (roll <= 0) return option.value
  }
  return options[options.length - 1].value
}

function getNearbyContainer(state: GameState): ContainerObj | null {
  let nearest: ContainerObj | null = null
  let nearestDist = Infinity
  for (const container of state.map.containers) {
    if (container.opened || container.pendingVerification) continue
    const d = distance(state.player.x, state.player.y, container.x, container.y)
    if (d > CONTAINER_GLOW_RANGE || d >= nearestDist) continue
    nearest = container
    nearestDist = d
  }
  return nearest
}

function findContainerById(state: GameState, containerId: number): ContainerObj | null {
  return state.map.containers.find((container) => container.id === containerId) ?? null
}

function resetContainerSearch(state: GameState) {
  state.searchContainerId = null
  state.searchContainerProgress = 0
}

function rollWeaponRarity(type: ContainerType): Rarity {
  if (type === 'rare_chest') {
    return weightedPick<Rarity>([
      { value: 'uncommon', weight: 20 },
      { value: 'rare', weight: 40 },
      { value: 'epic', weight: 28 },
      { value: 'legendary', weight: 12 },
    ])
  }
  return weightedPick<Rarity>([
    { value: 'common', weight: 32 },
    { value: 'uncommon', weight: 38 },
    { value: 'rare', weight: 20 },
    { value: 'epic', weight: 8 },
    { value: 'legendary', weight: 2 },
  ])
}

function rollLocalContainerReward(state: GameState, container: ContainerObj): ContainerRewardBundle {
  const roll = Math.floor(Math.random() * 10000)
  const ammoWeaponId = weightedPick<string>([
    { value: 'ar', weight: 34 },
    { value: 'smg', weight: 34 },
    { value: 'shotgun', weight: 20 },
    { value: 'sniper', weight: 12 },
  ])

  if (container.type === 'ammo_box') {
    const hasConsumable = roll < 4200
    const consumableId = hasConsumable
      ? weightedPick<ConsumableId>([
        { value: 'bandage', weight: 54 },
        { value: 'mini_shield', weight: 36 },
        { value: 'shield_potion', weight: 10 },
      ])
      : null
    const consumableAmount = consumableId === 'bandage'
      ? 2 + Math.floor(Math.random() * 2)
      : consumableId === 'mini_shield'
        ? 1 + Math.floor(Math.random() * 2)
        : consumableId
          ? 1
          : 0

    return {
      mapSeed: state.map.seed,
      containerId: container.id,
      containerType: container.type,
      roll,
      weaponId: null,
      weaponRarity: null,
      ammoAmount: 48 + Math.floor(Math.random() * 68),
      ammoWeaponId,
      consumableId,
      consumableAmount,
      materials: {
        wood: 6 + Math.floor(Math.random() * 8),
        stone: 0,
        metal: 0,
      },
      verified: false,
    }
  }

  const weaponId = weightedPick<string>([
    { value: 'ar', weight: 31 },
    { value: 'smg', weight: 28 },
    { value: 'shotgun', weight: 25 },
    { value: 'sniper', weight: 16 },
  ])
  const weaponRarity = rollWeaponRarity(container.type)
  const consumableId = weightedPick<ConsumableId>([
    { value: 'bandage', weight: container.type === 'rare_chest' ? 18 : 34 },
    { value: 'mini_shield', weight: container.type === 'rare_chest' ? 34 : 36 },
    { value: 'shield_potion', weight: container.type === 'rare_chest' ? 31 : 22 },
    { value: 'medkit', weight: container.type === 'rare_chest' ? 17 : 8 },
  ])
  const consumableAmount = consumableId === 'bandage'
    ? 2 + Math.floor(Math.random() * 2)
    : consumableId === 'mini_shield'
      ? 1 + Math.floor(Math.random() * 2)
      : 1

  return {
    mapSeed: state.map.seed,
    containerId: container.id,
    containerType: container.type,
    roll,
    weaponId,
    weaponRarity,
    ammoAmount: container.type === 'rare_chest'
      ? 64 + Math.floor(Math.random() * 56)
      : 34 + Math.floor(Math.random() * 42),
    ammoWeaponId: weaponId,
    consumableId,
    consumableAmount,
    materials: container.type === 'rare_chest'
      ? { wood: 40, stone: 24, metal: 8 }
      : { wood: 22, stone: 14, metal: 0 },
    verified: false,
  }
}

function spawnContainerReward(state: GameState, container: ContainerObj, result: ContainerRewardBundle) {
  if (result.weaponId && result.weaponRarity) {
    state.map.floorLoot.push({
      kind: 'weapon',
      x: container.x + (Math.random() - 0.5) * 30,
      y: container.y + 18,
      weaponId: result.weaponId,
      rarity: result.weaponRarity,
      picked: false,
    })
  }

  if (result.ammoAmount > 0) {
    state.map.floorLoot.push({
      kind: 'ammo',
      x: container.x + (Math.random() - 0.5) * 30,
      y: container.y - 12,
      amount: result.ammoAmount,
      rarity: result.weaponRarity ?? 'uncommon',
      weaponId: result.ammoWeaponId ?? undefined,
      picked: false,
    })
  }

  if (result.consumableId && result.consumableAmount > 0) {
    for (let i = 0; i < result.consumableAmount; i++) {
      state.map.floorLoot.push({
        kind: 'consumable',
        x: container.x + (Math.random() - 0.5) * 26,
        y: container.y + (Math.random() - 0.5) * 18,
        itemId: result.consumableId,
        rarity: CONSUMABLE_LOOT_RARITY[result.consumableId],
        picked: false,
      })
    }
  }

  grantMaterials(state.player, result.materials)
}

function applyContainerOpenResult(state: GameState, container: ContainerObj, result: ContainerRewardBundle) {
  container.pendingVerification = false
  container.opened = true
  state.pendingContainerId = null
  state.promptContainerId = null
  resetContainerSearch(state)
  playChestOpen()
  spawnContainerReward(state, container, result)
  state.onContainerPromptUpdate?.(null)
  state.onContainerOpened?.(result)
}

function requestContainerVerification(state: GameState, container: ContainerObj) {
  container.pendingVerification = true
  state.pendingContainerId = container.id
  state.searchNonce++
  resetContainerSearch(state)
  state.onContainerVerificationRequested?.({
    gameId: state.gameId,
    mapSeed: state.map.seed,
    containerId: container.id,
    containerType: container.type,
    seed: state.map.seed,
    playerNonce: state.searchNonce,
  })
}

function openContainerLocally(state: GameState, container: ContainerObj) {
  const result = rollLocalContainerReward(state, container)
  applyContainerOpenResult(state, container, result)
}

function actionCancelsConsumableUse(state: GameState): boolean {
  const { input, player } = state
  if (input.mouseDown) return true
  if (input.justPressed.has('r')) return true
  if (input.justPressed.has('e')) return true
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

// ── Team helpers ─────────────────────────────────────────────────────────────

/** Returns true if at least one enemy bot still on that team is alive. */
function isBotTeamAlive(state: GameState, teamId: number): boolean {
  return state.bots.some(b => b.teamId === teamId && b.alive)
}

// ── Aim Assist (human player only) ──────────────────────────────────────────

function computeAimAssist(
  state: GameState,
): { worldX: number; worldY: number; botIdx: number } | null {
  if (!state.player.alive || state.player.buildMode) return null

  const { input, camera: cam, player, bots } = state
  let bestIdx = -1
  let bestDistSq = AIM_ASSIST_RADIUS * AIM_ASSIST_RADIUS

  for (let i = 0; i < bots.length; i++) {
    const bot = bots[i]
    if (!bot.alive || bot.teamId === player.teamId) continue
    // Convert bot world position to screen space and compare to cursor
    const sx = bot.x - cam.x
    const sy = bot.y - cam.y
    const dx = sx - input.mouseX
    const dy = sy - input.mouseY
    const dSq = dx * dx + dy * dy
    if (dSq < bestDistSq) {
      bestDistSq = dSq
      bestIdx = i
    }
  }

  if (bestIdx < 0) return null

  const target = bots[bestIdx]
  return {
    worldX: input.mouseWorldX + (target.x - input.mouseWorldX) * AIM_ASSIST_STRENGTH,
    worldY: input.mouseWorldY + (target.y - input.mouseWorldY) * AIM_ASSIST_STRENGTH,
    botIdx: bestIdx,
  }
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

  // ── Aim assist (human player only) ───────────────────────────────────
  const aimAssist = computeAimAssist(state)
  state.aimAssistBotIdx = aimAssist?.botIdx ?? -1
  if (aimAssist) {
    state.input.mouseWorldX = aimAssist.worldX
    state.input.mouseWorldY = aimAssist.worldY
  }

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
        : loot.kind === 'consumable'
          ? tryPickupConsumable(state.player, loot.itemId)
          : addAmmoToPlayer(state.player, loot.amount, loot.weaponId) > 0
      if (picked) {
        loot.picked = true
        playPickup()
      }
    }
  }

  const pendingContainer = state.pendingContainerId !== null
    ? findContainerById(state, state.pendingContainerId)
    : null
  const nearbyContainer = getNearbyContainer(state)
  state.activeContainerId = pendingContainer?.id ?? nearbyContainer?.id ?? null

  if (pendingContainer && pendingContainer.pendingVerification && !pendingContainer.opened) {
    state.promptContainerId = pendingContainer.id
    state.onContainerPromptUpdate?.({
      key: 'E',
      containerType: pendingContainer.type,
      containerId: pendingContainer.id,
      status: 'verifying',
      progress: 1,
      searchTime: CONTAINER_SEARCH_TIME[pendingContainer.type],
    })
  } else {
    if (state.pendingContainerId !== null && !pendingContainer) {
      state.pendingContainerId = null
    }

    const canOpenContainer = !!nearbyContainer
      && !state.player.buildMode
      && distance(state.player.x, state.player.y, nearbyContainer.x, nearbyContainer.y) <= CONTAINER_INTERACT_RANGE

    if (nearbyContainer && canOpenContainer) {
      const searchTime = CONTAINER_SEARCH_TIME[nearbyContainer.type]
      const holdingInteract = state.input.keys.has('e')

      if (!holdingInteract) {
        if (state.searchContainerId === nearbyContainer.id) {
          resetContainerSearch(state)
        }
        state.promptContainerId = nearbyContainer.id
        state.onContainerPromptUpdate?.({
          key: 'E',
          containerType: nearbyContainer.type,
          containerId: nearbyContainer.id,
          status: 'ready',
          progress: 0,
          searchTime,
        })
      } else {
        if (state.searchContainerId !== nearbyContainer.id) {
          state.searchContainerId = nearbyContainer.id
          state.searchContainerProgress = 0
        }
        state.searchContainerProgress = Math.min(searchTime, state.searchContainerProgress + dt)
        const progress = Math.min(1, state.searchContainerProgress / searchTime)
        state.promptContainerId = nearbyContainer.id
        state.onContainerPromptUpdate?.({
          key: 'E',
          containerType: nearbyContainer.type,
          containerId: nearbyContainer.id,
          status: 'searching',
          progress,
          searchTime,
        })
        if (progress >= 1) {
          if (state.verifiedContainers) {
            requestContainerVerification(state, nearbyContainer)
          } else {
            openContainerLocally(state, nearbyContainer)
          }
        }
      }
    } else if (state.promptContainerId !== null) {
      state.promptContainerId = null
      resetContainerSearch(state)
      state.onContainerPromptUpdate?.(null)
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

    // Hit player (skip if shooter is a teammate)
    if (p.ownerId >= 0 && state.player.alive) {
      const shooterBot = state.bots[p.ownerId]
      if (shooterBot && shooterBot.teamId !== state.player.teamId && circleOverlap(p.x, p.y, 4, state.player.x, state.player.y, PLAYER_SIZE / 2)) {
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
          shooterBot.kills++
          addKillFeed(state, shooterBot.name, state.player.name, p.weaponId)
          state.aliveCount--
          state.aliveTeams--
          state.placement = state.aliveCount
          state.phase = 'eliminated'
          state.onPhaseChange?.('eliminated')
        }
        continue
      }
    }

    // Hit bots (skip friendly fire)
    const shooterTeamId = p.ownerId === -1 ? state.player.teamId : (state.bots[p.ownerId]?.teamId ?? -1)
    let projectileRemoved = false
    for (let j = 0; j < state.bots.length; j++) {
      const bot = state.bots[j]
      if (!bot.alive || j === p.ownerId) continue
      if (bot.teamId === shooterTeamId) continue  // no friendly fire
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

          // Decrement aliveTeams if bot's entire team is gone (team 0 decremented on player death)
          if (bot.teamId !== 0 && !isBotTeamAlive(state, bot.teamId)) {
            state.aliveTeams--
          }

          // Check victory
          if (state.aliveTeams <= 1 && state.player.alive) {
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

    let blockedByBuild = false
    for (let j = state.map.playerBuilds.length - 1; j >= 0; j--) {
      const pb = state.map.playerBuilds[j]
      if (!pb.blocksProjectiles) continue
      if (p.x >= pb.x && p.x <= pb.x + pb.w && p.y >= pb.y && p.y <= pb.y + pb.h) {
        pb.health -= p.damage
        emitSparks(state.particles, p.x, p.y, 3, '#aaa')
        state.projectiles.splice(i, 1)
        blockedByBuild = true
        if (pb.health <= 0) {
          state.map.playerBuilds.splice(j, 1)
        }
        break
      }
    }
    if (blockedByBuild) continue

    // Hit trees
    let blockedByTree = false
    for (let j = state.map.trees.length - 1; j >= 0; j--) {
      const t = state.map.trees[j]
      if (p.x >= t.x - 8 && p.x <= t.x + 8 && p.y >= t.y - 6 && p.y <= t.y + 10) {
        emitSparks(state.particles, p.x, p.y, 3, '#6b4226')
        state.projectiles.splice(i, 1)
        blockedByTree = true
        break
      }
    }
    if (blockedByTree) continue

    // Hit rocks
    for (let j = state.map.rocks.length - 1; j >= 0; j--) {
      const r = state.map.rocks[j]
      if (p.x >= r.x - 10 && p.x <= r.x + 10 && p.y >= r.y - 8 && p.y <= r.y + 8) {
        emitSparks(state.particles, p.x, p.y, 3, '#888')
        state.projectiles.splice(i, 1)
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
    const healthDmg = Math.min(state.player.health, dmg)
    if (healthDmg > 0) {
      state.player.health -= healthDmg
      if (state.player.health <= 0) {
        state.player.health = 0
        state.player.alive = false
      }
      cancelConsumableUse(state.player)
    }
    if (!state.player.alive) {
      emitElimination(state.particles, state.player.x, state.player.y)
      playEliminated()
      state.aliveCount--
      state.aliveTeams--
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

      if (bot.teamId !== 0 && !isBotTeamAlive(state, bot.teamId)) {
        state.aliveTeams--
      }

      if (state.aliveTeams <= 1 && state.player.alive) {
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
  const attackerTeamId = attackerId === -1 ? state.player.teamId : (state.bots[attackerId]?.teamId ?? -1)
  for (let i = 0; i < state.bots.length; i++) {
    const bot = state.bots[i]
    if (!bot.alive) continue
    if (bot.teamId === attackerTeamId) continue  // no friendly fire
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

        if (bot.teamId !== 0 && !isBotTeamAlive(state, bot.teamId)) {
          state.aliveTeams--
        }

        if (state.aliveTeams <= 1 && state.player.alive) {
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

export function confirmVerifiedContainerOpen(state: GameState, result: ContainerRewardBundle): boolean {
  const container = findContainerById(state, result.containerId)
  if (!container || !container.pendingVerification || container.opened) {
    return false
  }
  applyContainerOpenResult(state, container, { ...result, verified: true })
  return true
}

export function rejectVerifiedContainerOpen(state: GameState, containerId: number): boolean {
  const container = findContainerById(state, containerId)
  if (!container || !container.pendingVerification || container.opened) {
    return false
  }
  container.pendingVerification = false
  state.pendingContainerId = null
  if (state.promptContainerId === containerId) {
    state.promptContainerId = null
    state.onContainerPromptUpdate?.(null)
  }
  resetContainerSearch(state)
  return true
}

// ── Render ──────────────────────────────────────────────────────────────────

export function renderGame(ctx: CanvasRenderingContext2D, state: GameState) {
  const { camera: cam, player, bots, map, storm, particles, projectiles, supplyDrops } = state

  ctx.clearRect(0, 0, cam.width, cam.height)

  // ── Map ───────────────────────────────────────────────────────────────
  renderMap(ctx, map, cam, {
    highlightedContainerId: state.activeContainerId,
    time: state.time,
  })

  // ── Floor loot ────────────────────────────────────────────────────────
  for (const loot of map.floorLoot) {
    if (loot.picked) continue
    const sx = loot.x - cam.x
    const sy = loot.y - cam.y
    if (sx < -20 || sx > cam.width + 20 || sy < -20 || sy > cam.height + 20) continue
    if (loot.kind === 'ammo') {
      drawAmmoPack(ctx, sx, sy, state.time)
      continue
    }
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
    // Use aim-assisted world coords so the crosshair snaps with the aim
    const cx = state.input.mouseWorldX - cam.x
    const cy = state.input.mouseWorldY - cam.y
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

  // Dark border ring
  ctx.fillStyle = 'rgba(0, 0, 0, 0.75)'
  ctx.beginPath()
  ctx.arc(cx, cy, radius + 3, 0, Math.PI * 2)
  ctx.fill()

  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, Math.PI * 2)
  ctx.clip()

  // Terrain (pre-rendered canvas or fallback flat green)
  if (state.map.minimapCanvas) {
    ctx.drawImage(state.map.minimapCanvas, mx, my, mSize, mSize)
  } else {
    ctx.fillStyle = '#2a5a2a'
    ctx.fillRect(mx, my, mSize, mSize)
  }

  // Storm
  renderStormMinimap(ctx, state.storm, mx, my, mSize)

  // Supply drops
  for (const drop of state.supplyDrops) {
    if (drop.opened) continue
    drawMinimapDot(ctx, mx + drop.x * scale, my + drop.y * scale, COLORS.supplyDrop, 3)
  }

  // Enemies (red dots, slightly larger than before so they read well)
  for (const bot of state.bots) {
    if (!bot.alive) continue
    drawMinimapDot(ctx, mx + bot.x * scale, my + bot.y * scale, COLORS.bot, 2)
  }

  // Player (bright cyan, largest dot)
  if (state.player.alive) {
    drawMinimapDot(ctx, mx + state.player.x * scale, my + state.player.y * scale, COLORS.player, 3.5)
  }

  ctx.restore()

  // Outer border ring
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.arc(cx, cy, radius + 1, 0, Math.PI * 2)
  ctx.stroke()

  // ── Location name ────────────────────────────────────────────────────────
  const px = state.player.x
  const py = state.player.y
  let locationName: string | null = null
  for (const poi of POI_DEFS) {
    const x1 = poi.tileX * TILE_SIZE
    const y1 = poi.tileY * TILE_SIZE
    const x2 = (poi.tileX + poi.width)  * TILE_SIZE
    const y2 = (poi.tileY + poi.height) * TILE_SIZE
    if (px >= x1 && px <= x2 && py >= y1 && py <= y2) {
      locationName = poi.name
      break
    }
  }

  if (locationName) {
    ctx.font = 'bold 10px monospace'
    const tw = ctx.measureText(locationName).width
    const lx = cx - tw / 2
    const ly = my + mSize + MINIMAP_PADDING - 1
    ctx.fillStyle = 'rgba(0,0,0,0.65)'
    ctx.fillRect(lx - 5, ly - 11, tw + 10, 15)
    ctx.fillStyle = '#e8e8e8'
    ctx.fillText(locationName, lx, ly)
  }
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
