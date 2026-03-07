// ── Somnia Event Types ──────────────────────────────────────────────────────

export type SomniaEventType =
  | 'queue_joined'
  | 'queue_left'
  | 'game_started'
  | 'game_ended'
  | 'reactive_force_start'
  | 'reactive_reward_claim'
  | 'leaderboard_updated'
  | 'storm_committed'
  | 'chest_opened'
  | 'reward_claimed'
  | 'session_approved'
  | 'session_revoked'
  | 'chain_connected'
  | 'chain_error'

export interface SomniaEvent {
  id: string
  type: SomniaEventType
  timestamp: number
  data:
    | QueueEventData
    | GameStartedEventData
    | GameEndedEventData
    | ReactiveForceStartEventData
    | ReactiveRewardClaimEventData
    | LeaderboardUpdatedEventData
    | StormCommittedEventData
    | ChestOpenedEventData
    | RewardClaimedEventData
    | SessionEventData
    | ConnectionEventData
  source: 'testnet' | 'orchestrator'
  txHash?: string
}

export interface QueueEventData {
  player: string
  queueSize: number
}

export interface GameStartedEventData {
  gameId: number
  players: string[]
  prizePool: string
}

export interface GameEndedEventData {
  gameId: number
  winner: string
  placements: string[]
  prizePool: string
}

export interface ReactiveForceStartEventData {
  player: string
  queueSize: number
  success: boolean
}

export interface ReactiveRewardClaimEventData {
  gameId: number
  player: string
  placement: number
  success: boolean
}

export interface LeaderboardUpdatedEventData {
  gameId: number
  winner: string
  playerCount: number
  prizePool: string
}

export interface StormCommittedEventData {
  gameId: number
  phase: number
  currentCenterX: number
  currentCenterY: number
  currentRadius: number
  targetCenterX: number
  targetCenterY: number
  targetRadius: number
  entropyHash: string
  timestamp: number
}

export interface ChestOpenedEventData {
  gameId: number
  player: string
  containerType: 'chest' | 'rare_chest' | 'ammo_box'
  weaponId: string | null
  consumableId: string | null
  ammoAmount: number
}

export interface RewardClaimedEventData {
  player: string
  amount: string
}

export interface SessionEventData {
  player: string
  sessionKey: string
  expiry?: number
}

export interface ConnectionEventData {
  message: string
}

// ── Event constructors ──────────────────────────────────────────────────────

let eventCounter = 0

function nextId(): string {
  return `evt-${++eventCounter}`
}

export function createQueueJoinedEvent(
  player: string,
  queueSize: number,
  txHash?: string,
): SomniaEvent {
  return {
    id: nextId(),
    type: 'queue_joined',
    timestamp: Date.now(),
    data: { player, queueSize } as QueueEventData,
    source: 'testnet',
    txHash,
  }
}

export function createQueueLeftEvent(
  player: string,
  queueSize: number,
  txHash?: string,
): SomniaEvent {
  return {
    id: nextId(),
    type: 'queue_left',
    timestamp: Date.now(),
    data: { player, queueSize } as QueueEventData,
    source: 'testnet',
    txHash,
  }
}

export function createGameStartedEvent(
  gameId: number,
  players: string[],
  prizePool: string,
  txHash?: string,
): SomniaEvent {
  return {
    id: nextId(),
    type: 'game_started',
    timestamp: Date.now(),
    data: { gameId, players, prizePool } as GameStartedEventData,
    source: 'testnet',
    txHash,
  }
}

export function createGameEndedEvent(
  gameId: number,
  winner: string,
  placements: string[],
  prizePool: string,
  txHash?: string,
): SomniaEvent {
  return {
    id: nextId(),
    type: 'game_ended',
    timestamp: Date.now(),
    data: { gameId, winner, placements, prizePool } as GameEndedEventData,
    source: 'testnet',
    txHash,
  }
}

export function createReactiveForceStartEvent(
  player: string,
  queueSize: number,
  success: boolean,
  txHash?: string,
): SomniaEvent {
  return {
    id: nextId(),
    type: 'reactive_force_start',
    timestamp: Date.now(),
    data: { player, queueSize, success } as ReactiveForceStartEventData,
    source: 'testnet',
    txHash,
  }
}

export function createReactiveRewardClaimEvent(
  gameId: number,
  player: string,
  placement: number,
  success: boolean,
  txHash?: string,
): SomniaEvent {
  return {
    id: nextId(),
    type: 'reactive_reward_claim',
    timestamp: Date.now(),
    data: { gameId, player, placement, success } as ReactiveRewardClaimEventData,
    source: 'testnet',
    txHash,
  }
}

export function createLeaderboardUpdatedEvent(
  gameId: number,
  winner: string,
  playerCount: number,
  prizePool: string,
  txHash?: string,
): SomniaEvent {
  return {
    id: nextId(),
    type: 'leaderboard_updated',
    timestamp: Date.now(),
    data: { gameId, winner, playerCount, prizePool } as LeaderboardUpdatedEventData,
    source: 'testnet',
    txHash,
  }
}

export function createStormCommittedEvent(
  data: StormCommittedEventData,
  txHash?: string,
): SomniaEvent {
  return {
    id: nextId(),
    type: 'storm_committed',
    timestamp: Date.now(),
    data,
    source: 'testnet',
    txHash,
  }
}

export function createChestOpenedEvent(
  gameId: number,
  player: string,
  containerType: 'chest' | 'rare_chest' | 'ammo_box',
  weaponId: string | null,
  consumableId: string | null,
  ammoAmount: number,
  txHash?: string,
): SomniaEvent {
  return {
    id: nextId(),
    type: 'chest_opened',
    timestamp: Date.now(),
    data: { gameId, player, containerType, weaponId, consumableId, ammoAmount } as ChestOpenedEventData,
    source: 'testnet',
    txHash,
  }
}

export function createRewardClaimedEvent(
  player: string,
  amount: string,
  txHash?: string,
): SomniaEvent {
  return {
    id: nextId(),
    type: 'reward_claimed',
    timestamp: Date.now(),
    data: { player, amount } as RewardClaimedEventData,
    source: 'testnet',
    txHash,
  }
}

export function createSessionApprovedEvent(
  player: string,
  sessionKey: string,
  expiry: number,
  txHash?: string,
): SomniaEvent {
  return {
    id: nextId(),
    type: 'session_approved',
    timestamp: Date.now(),
    data: { player, sessionKey, expiry } as SessionEventData,
    source: 'testnet',
    txHash,
  }
}

export function createSessionRevokedEvent(
  player: string,
  sessionKey: string,
  txHash?: string,
): SomniaEvent {
  return {
    id: nextId(),
    type: 'session_revoked',
    timestamp: Date.now(),
    data: { player, sessionKey } as SessionEventData,
    source: 'testnet',
    txHash,
  }
}

export function createConnectionEvent(
  message: string,
  type: SomniaEventType = 'chain_connected',
): SomniaEvent {
  return {
    id: nextId(),
    type,
    timestamp: Date.now(),
    data: { message } as ConnectionEventData,
    source: 'orchestrator',
  }
}

// ── Format for display ──────────────────────────────────────────────────────

export function formatEventMessage(event: SomniaEvent): string {
  switch (event.type) {
    case 'queue_joined': {
      const d = event.data as QueueEventData
      return `${d.player.slice(0, 6)}... joined queue (${d.queueSize})`
    }
    case 'queue_left': {
      const d = event.data as QueueEventData
      return `${d.player.slice(0, 6)}... left queue (${d.queueSize})`
    }
    case 'game_started': {
      const d = event.data as GameStartedEventData
      return `Match #${d.gameId} started with ${d.players.length} players`
    }
    case 'game_ended': {
      const d = event.data as GameEndedEventData
      return `Match #${d.gameId} ended. Winner: ${d.winner.slice(0, 6)}...`
    }
    case 'reactive_force_start': {
      const d = event.data as ReactiveForceStartEventData
      return d.success
        ? `Reactive orchestrator started queue at ${d.queueSize} players`
        : `Reactive start checked queue at ${d.queueSize} players`
    }
    case 'reactive_reward_claim': {
      const d = event.data as ReactiveRewardClaimEventData
      return d.success
        ? `Auto-paid P${d.placement} rewards for ${d.player.slice(0, 6)}...`
        : `Auto-pay retry needed for ${d.player.slice(0, 6)}...`
    }
    case 'leaderboard_updated': {
      const d = event.data as LeaderboardUpdatedEventData
      return `On-chain leaderboard updated for match #${d.gameId}`
    }
    case 'storm_committed': {
      const d = event.data as StormCommittedEventData
      return `Storm p${d.phase + 1} committed for match #${d.gameId} -> r:${d.targetRadius}`
    }
    case 'chest_opened': {
      const d = event.data as ChestOpenedEventData
      const label = d.containerType === 'rare_chest'
        ? 'rare chest'
        : d.containerType === 'ammo_box'
          ? 'ammo box'
          : 'chest'
      const weapon = d.weaponId ? `weapon:${d.weaponId}` : 'no-weapon'
      const utility = d.consumableId ? `, utility:${d.consumableId}` : ''
      return `${d.player.slice(0, 6)}... opened ${label} (${weapon}, ammo:+${d.ammoAmount}${utility})`
    }
    case 'reward_claimed': {
      const d = event.data as RewardClaimedEventData
      return `${d.player.slice(0, 6)}... claimed rewards`
    }
    case 'session_approved': {
      const d = event.data as SessionEventData
      return `Session key approved for ${d.player.slice(0, 6)}...`
    }
    case 'session_revoked': {
      const d = event.data as SessionEventData
      return `Session key revoked for ${d.player.slice(0, 6)}...`
    }
    case 'chain_connected':
    case 'chain_error': {
      const d = event.data as ConnectionEventData
      return d.message
    }
    default:
      return 'Unknown event'
  }
}
