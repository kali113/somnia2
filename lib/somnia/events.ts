// ── Somnia Event Types ──────────────────────────────────────────────────────

export type SomniaEventType =
  | 'queue_joined'
  | 'queue_left'
  | 'game_started'
  | 'game_ended'
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
