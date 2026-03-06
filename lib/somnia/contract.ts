import { formatEther, parseEther, type Abi, type Address } from 'viem'
import PIXEL_ROYALE_ABI from '@/contracts/abi.json'
import {
  GAME_CONTRACT_ADDRESS,
  IS_GAME_CONTRACT_CONFIGURED,
  SOMNIA_FAUCET_URL,
  ZERO_ADDRESS,
} from '@/lib/somnia/config'

export { SOMNIA_FAUCET_URL }

// ── Contract Address ────────────────────────────────────────────────────────
export const PIXEL_ROYALE_ADDRESS = GAME_CONTRACT_ADDRESS as Address
export const IS_PIXEL_ROYALE_CONFIGURED = IS_GAME_CONTRACT_CONFIGURED

export const CONTRACT_CONFIG_ERROR_MESSAGE =
  'PixelRoyale contract address is not configured. Set NEXT_PUBLIC_PIXEL_ROYALE_ADDRESS to your deployed Somnia contract address.'

// ── Entry fee (must match contract) ─────────────────────────────────────────
export const ENTRY_FEE = parseEther('0.001') // 0.001 STT
export const GAS_RESERVE = parseEther('0.01') // recommended tx buffer
export const MIN_QUEUE_BALANCE = ENTRY_FEE + GAS_RESERVE

function assertContractConfigured(): void {
  if (!IS_PIXEL_ROYALE_CONFIGURED || PIXEL_ROYALE_ADDRESS.toLowerCase() === ZERO_ADDRESS) {
    throw new Error(CONTRACT_CONFIG_ERROR_MESSAGE)
  }
}

// ── ABI Export ──────────────────────────────────────────────────────────────
export const pixelRoyaleAbi = PIXEL_ROYALE_ABI as Abi

// ── Types ───────────────────────────────────────────────────────────────────
export interface PlayerStats {
  gamesPlayed: bigint
  wins: bigint
  kills: bigint
  totalEarned: bigint
}

export interface GameResult {
  gameId: bigint
  timestamp: bigint
  winner: Address
  placements: Address[]
  prizePool: bigint
  playerCount: number
}

// ── Read helpers (used via wallet hook shim or directly) ─────────────────────

export function getQueueSizeArgs() {
  return {
    address: PIXEL_ROYALE_ADDRESS,
    abi: pixelRoyaleAbi,
    functionName: 'getQueueSize',
  } as const
}

export function getQueuePlayersArgs() {
  return {
    address: PIXEL_ROYALE_ADDRESS,
    abi: pixelRoyaleAbi,
    functionName: 'getQueuePlayers',
  } as const
}

export function getInQueueArgs(player: Address) {
  return {
    address: PIXEL_ROYALE_ADDRESS,
    abi: pixelRoyaleAbi,
    functionName: 'inQueue',
    args: [player],
  } as const
}

export function getPlayerStatsArgs(player: Address) {
  return {
    address: PIXEL_ROYALE_ADDRESS,
    abi: pixelRoyaleAbi,
    functionName: 'getPlayerStats',
    args: [player],
  } as const
}

export function getPendingRewardsArgs(player: Address) {
  return {
    address: PIXEL_ROYALE_ADDRESS,
    abi: pixelRoyaleAbi,
    functionName: 'pendingRewards',
    args: [player],
  } as const
}

export function getPlayerGameIdsArgs(player: Address) {
  return {
    address: PIXEL_ROYALE_ADDRESS,
    abi: pixelRoyaleAbi,
    functionName: 'getPlayerGameIds',
    args: [player],
  } as const
}

export function getGameResultArgs(index: bigint) {
  return {
    address: PIXEL_ROYALE_ADDRESS,
    abi: pixelRoyaleAbi,
    functionName: 'getGameResult',
    args: [index],
  } as const
}

export function getRecentGamesArgs(count: bigint) {
  return {
    address: PIXEL_ROYALE_ADDRESS,
    abi: pixelRoyaleAbi,
    functionName: 'getRecentGames',
    args: [count],
  } as const
}

export function getIsValidSessionArgs(player: Address, sessionKey: Address) {
  return {
    address: PIXEL_ROYALE_ADDRESS,
    abi: pixelRoyaleAbi,
    functionName: 'isValidSession',
    args: [player, sessionKey],
  } as const
}

// ── Write helpers (args for wallet hook shim useWriteContract) ───────────────

export function joinQueueArgs() {
  assertContractConfigured()
  return {
    address: PIXEL_ROYALE_ADDRESS,
    abi: pixelRoyaleAbi,
    functionName: 'joinQueue',
    value: ENTRY_FEE,
  } as const
}

export function leaveQueueArgs() {
  assertContractConfigured()
  return {
    address: PIXEL_ROYALE_ADDRESS,
    abi: pixelRoyaleAbi,
    functionName: 'leaveQueue',
  } as const
}

export function approveSessionKeyArgs(sessionKey: Address, expiry: bigint) {
  assertContractConfigured()
  return {
    address: PIXEL_ROYALE_ADDRESS,
    abi: pixelRoyaleAbi,
    functionName: 'approveSessionKey',
    args: [sessionKey, expiry],
  } as const
}

export function revokeSessionKeyArgs(sessionKey: Address) {
  assertContractConfigured()
  return {
    address: PIXEL_ROYALE_ADDRESS,
    abi: pixelRoyaleAbi,
    functionName: 'revokeSessionKey',
    args: [sessionKey],
  } as const
}

export function claimRewardsArgs() {
  assertContractConfigured()
  return {
    address: PIXEL_ROYALE_ADDRESS,
    abi: pixelRoyaleAbi,
    functionName: 'claimRewards',
  } as const
}

// ── Utility ─────────────────────────────────────────────────────────────────

export function formatSTT(wei: bigint, decimals: number = 4): string {
  const str = formatEther(wei)
  const parts = str.split('.')
  if (parts.length === 1) return str
  return `${parts[0]}.${parts[1].slice(0, decimals)}`
}

export function truncateAddress(address: string, chars: number = 4): string {
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`
}
