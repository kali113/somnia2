// ── Game Constants ──────────────────────────────────────────────────────────

export const TILE_SIZE = 32
export const MAP_TILES_X = 100
export const MAP_TILES_Y = 100
export const MAP_WIDTH = MAP_TILES_X * TILE_SIZE   // 3200
export const MAP_HEIGHT = MAP_TILES_Y * TILE_SIZE  // 3200

export const PLAYER_SIZE = 20
export const PLAYER_SPEED = 160        // px/s
export const PLAYER_MAX_HEALTH = 100
export const PLAYER_MAX_SHIELD = 100

export const BOT_COUNT = 24

// ── Rarity Colors ──────────────────────────────────────────────────────────

export const RARITY_COLORS: Record<string, string> = {
  common:    '#9d9d9d',
  uncommon:  '#6bff4f',
  rare:      '#4fa2ff',
  epic:      '#c44fff',
  legendary: '#ffa630',
}

export const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const
export type Rarity = typeof RARITY_ORDER[number]

// ── Weapon Definitions ─────────────────────────────────────────────────────

export interface WeaponDef {
  id: string
  name: string
  damage: number
  fireRate: number      // shots per second
  range: number         // pixels
  spread: number        // radians
  projectileSpeed: number
  magSize: number
  reloadTime: number    // seconds
  isMelee: boolean
  burstCount?: number
}

export const WEAPONS: Record<string, WeaponDef> = {
  pickaxe: {
    id: 'pickaxe',
    name: 'Pickaxe',
    damage: 20,
    fireRate: 1.5,
    range: 50,
    spread: 0,
    projectileSpeed: 0,
    magSize: Infinity,
    reloadTime: 0,
    isMelee: true,
  },
  ar: {
    id: 'ar',
    name: 'Assault Rifle',
    damage: 30,
    fireRate: 5.5,
    range: 600,
    spread: 0.06,
    projectileSpeed: 1200,
    magSize: 30,
    reloadTime: 2.2,
    isMelee: false,
  },
  shotgun: {
    id: 'shotgun',
    name: 'Shotgun',
    damage: 80,
    fireRate: 0.9,
    range: 200,
    spread: 0.25,
    projectileSpeed: 900,
    magSize: 5,
    reloadTime: 4.5,
    isMelee: false,
    burstCount: 5,
  },
  smg: {
    id: 'smg',
    name: 'SMG',
    damage: 18,
    fireRate: 10,
    range: 350,
    spread: 0.1,
    projectileSpeed: 1000,
    magSize: 35,
    reloadTime: 2,
    isMelee: false,
  },
  sniper: {
    id: 'sniper',
    name: 'Sniper Rifle',
    damage: 105,
    fireRate: 0.6,
    range: 1200,
    spread: 0.005,
    projectileSpeed: 2000,
    magSize: 1,
    reloadTime: 2.8,
    isMelee: false,
  },
}

// ── Item Definitions ───────────────────────────────────────────────────────

export interface ItemDef {
  id: string
  name: string
  healAmount?: number
  shieldAmount?: number
  useTime: number   // seconds
  stackable: boolean
  maxStack: number
}

export const ITEMS: Record<string, ItemDef> = {
  medkit: {
    id: 'medkit',
    name: 'Medkit',
    healAmount: 100,
    useTime: 10,
    stackable: true,
    maxStack: 3,
  },
  bandage: {
    id: 'bandage',
    name: 'Bandage',
    healAmount: 15,
    useTime: 3.5,
    stackable: true,
    maxStack: 15,
  },
  shield_potion: {
    id: 'shield_potion',
    name: 'Shield Potion',
    shieldAmount: 50,
    useTime: 5,
    stackable: true,
    maxStack: 2,
  },
  mini_shield: {
    id: 'mini_shield',
    name: 'Mini Shield',
    shieldAmount: 25,
    useTime: 2,
    stackable: true,
    maxStack: 6,
  },
}

// ── Storm Phases ────────────────────────────────────────────────────────────

export interface StormPhase {
  waitTime: number      // seconds before shrinking
  shrinkTime: number    // seconds to shrink
  endRadius: number     // final radius for this phase
  damagePerTick: number // damage per 0.5s
}

export const STORM_PHASES: StormPhase[] = [
  { waitTime: 60, shrinkTime: 45, endRadius: 1200, damagePerTick: 1 },
  { waitTime: 40, shrinkTime: 35, endRadius: 800, damagePerTick: 2 },
  { waitTime: 30, shrinkTime: 25, endRadius: 450, damagePerTick: 5 },
  { waitTime: 20, shrinkTime: 20, endRadius: 200, damagePerTick: 8 },
  { waitTime: 15, shrinkTime: 15, endRadius: 50, damagePerTick: 10 },
  { waitTime: 0, shrinkTime: 10, endRadius: 0, damagePerTick: 15 },
]

// ── Building ────────────────────────────────────────────────────────────────

export const BUILDING_GRID = 32
export const BUILDING_HEALTH: Record<string, number> = {
  wood: 150,
  stone: 300,
  metal: 500,
}

export const MATERIAL_HARVEST: Record<string, { wood: number; stone: number; metal: number }> = {
  tree: { wood: 30, stone: 0, metal: 0 },
  rock: { wood: 0, stone: 30, metal: 0 },
  car: { wood: 0, stone: 0, metal: 25 },
  wall: { wood: 5, stone: 5, metal: 5 },
}

// ── Map POIs ────────────────────────────────────────────────────────────────

export interface POIDef {
  name: string
  tileX: number
  tileY: number
  width: number   // in tiles
  height: number  // in tiles
}

export const POI_DEFS: POIDef[] = [
  { name: 'Tilted Towers', tileX: 25, tileY: 25, width: 18, height: 18 },
  { name: 'Pleasant Park', tileX: 60, tileY: 15, width: 16, height: 14 },
  { name: 'Retail Row', tileX: 70, tileY: 65, width: 14, height: 12 },
  { name: 'Salty Springs', tileX: 45, tileY: 55, width: 12, height: 10 },
  { name: 'Lonely Lodge', tileX: 85, tileY: 35, width: 10, height: 10 },
  { name: 'Dusty Depot', tileX: 40, tileY: 40, width: 10, height: 8 },
  { name: 'Loot Lake', tileX: 15, tileY: 60, width: 14, height: 14 },
  { name: 'Greasy Grove', tileX: 10, tileY: 80, width: 12, height: 10 },
]

// ── Colors ──────────────────────────────────────────────────────────────────

export const COLORS = {
  grass: '#4a7c3f',
  grassDark: '#3d6934',
  sand: '#d4b96a',
  water: '#3a7bd5',
  waterDark: '#2d63b0',
  building: '#8a7a6b',
  buildingDark: '#6e5e50',
  road: '#5a5a5a',
  tree: '#2d5a1e',
  treeTrunk: '#6b4226',
  rock: '#8a8a8a',
  chest: '#ffd700',
  player: '#3ae8ff',
  playerOutline: '#1bb8cc',
  bot: '#ff4444',
  botOutline: '#cc2222',
  stormEdge: '#7b2dff',
  stormFill: 'rgba(123, 45, 255, 0.25)',
  supplyDrop: '#00e5ff',
  healthBar: '#4cff4c',
  shieldBar: '#4ca6ff',
  xpBar: '#ffd700',
  uiBg: 'rgba(0, 0, 0, 0.75)',
  uiBorder: 'rgba(255, 255, 255, 0.15)',
}

// ── Misc ────────────────────────────────────────────────────────────────────

export const CHEST_SPAWN_COUNT = 80
export const FLOOR_LOOT_COUNT = 60
export const SUPPLY_DROP_INTERVAL = 45  // seconds
export const MINIMAP_SIZE = 160
export const MINIMAP_PADDING = 12

export const BOT_NAMES = [
  'ShadowSniper', 'PixelProwler', 'StormChaser', 'NeonNinja',
  'CyberSamurai', 'GhostReaper', 'BlazeMaster', 'FrostByte',
  'ThunderStrike', 'VortexKing', 'IronFist', 'DarkPhoenix',
  'CrimsonBlade', 'SilverArrow', 'GoldenEagle', 'SteelWolf',
  'RapidFire', 'AcidRain', 'MoonWalker', 'StarDust',
  'WildCard', 'LoneRanger', 'NightHawk', 'SwiftFox',
  'BoulderCrush', 'FlameRunner', 'IceBreaker', 'VoltStrike',
  'SonicBoom', 'TurboJet',
]
