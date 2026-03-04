// ── Somnia Reactive Event Types ─────────────────────────────────────────────

import type { Rarity } from '@/lib/game/constants'

export type SomniaEventType = 'supply_drop' | 'storm_change' | 'kill_milestone' | 'chain_connected' | 'chain_error'

export interface SomniaEvent {
  id: string
  type: SomniaEventType
  timestamp: number
  data: SupplyDropEventData | StormChangeEventData | KillMilestoneEventData | ConnectionEventData
  source: 'demo' | 'testnet'
  txHash?: string
}

export interface SupplyDropEventData {
  x: number
  y: number
  rarity: Rarity
  itemCount: number
}

export interface StormChangeEventData {
  phase: number
  centerX: number
  centerY: number
  radius: number
}

export interface KillMilestoneEventData {
  player: string
  killCount: number
  reward: string
}

export interface ConnectionEventData {
  message: string
  address?: string
}

// ── Event constructors ──────────────────────────────────────────────────────

let eventCounter = 0

export function createSupplyDropEvent(
  x: number, y: number, rarity: Rarity, source: 'demo' | 'testnet',
  txHash?: string,
): SomniaEvent {
  return {
    id: `evt-${++eventCounter}`,
    type: 'supply_drop',
    timestamp: Date.now(),
    data: { x, y, rarity, itemCount: 3 } as SupplyDropEventData,
    source,
    txHash,
  }
}

export function createStormChangeEvent(
  phase: number, centerX: number, centerY: number, radius: number,
  source: 'demo' | 'testnet', txHash?: string,
): SomniaEvent {
  return {
    id: `evt-${++eventCounter}`,
    type: 'storm_change',
    timestamp: Date.now(),
    data: { phase, centerX, centerY, radius } as StormChangeEventData,
    source,
    txHash,
  }
}

export function createKillMilestoneEvent(
  player: string, killCount: number, reward: string,
  source: 'demo' | 'testnet', txHash?: string,
): SomniaEvent {
  return {
    id: `evt-${++eventCounter}`,
    type: 'kill_milestone',
    timestamp: Date.now(),
    data: { player, killCount, reward } as KillMilestoneEventData,
    source,
    txHash,
  }
}

export function createConnectionEvent(
  message: string, type: SomniaEventType = 'chain_connected',
  address?: string,
): SomniaEvent {
  return {
    id: `evt-${++eventCounter}`,
    type,
    timestamp: Date.now(),
    data: { message, address } as ConnectionEventData,
    source: 'testnet',
  }
}

// ── Format for display ──────────────────────────────────────────────────────

export function formatEventMessage(event: SomniaEvent): string {
  switch (event.type) {
    case 'supply_drop': {
      const d = event.data as SupplyDropEventData
      return `Supply Drop incoming! [${d.rarity.toUpperCase()}]`
    }
    case 'storm_change': {
      const d = event.data as StormChangeEventData
      return `Storm Phase ${d.phase + 1} - Circle shrinking!`
    }
    case 'kill_milestone': {
      const d = event.data as KillMilestoneEventData
      return `${d.player} reached ${d.killCount} eliminations! ${d.reward}`
    }
    case 'chain_connected': {
      const d = event.data as ConnectionEventData
      return d.message
    }
    case 'chain_error': {
      const d = event.data as ConnectionEventData
      return d.message
    }
    default:
      return 'Unknown event'
  }
}
