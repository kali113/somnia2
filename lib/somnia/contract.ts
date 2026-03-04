import { getContract, formatEther, parseEther, type Address, type PublicClient } from 'viem'
import { somniaTestnet } from '@/lib/wagmi-config'
import PIXEL_ROYALE_ABI from '@/contracts/abi.json'

// ── Contract Address ────────────────────────────────────────────────────────
// Replace this with your deployed contract address on Somnia Testnet
export const PIXEL_ROYALE_ADDRESS: Address = '0x0000000000000000000000000000000000000000'

// ── Entry fee (must match contract) ─────────────────────────────────────────
export const ENTRY_FEE = parseEther('0.001') // 0.001 STT

// ── Faucet URL ──────────────────────────────────────────────────────────────
export const SOMNIA_FAUCET_URL = 'https://testnet.somnia.network/'

// ── ABI Export ──────────────────────────────────────────────────────────────
export const pixelRoyaleAbi = PIXEL_ROYALE_ABI as any

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

// ── Read helpers (used via wagmi's useReadContract or directly) ──────────────

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

// ── Write helpers (args for wagmi's useWriteContract) ───────────────────────

export function joinQueueArgs() {
  return {
    address: PIXEL_ROYALE_ADDRESS,
    abi: pixelRoyaleAbi,
    functionName: 'joinQueue',
    value: ENTRY_FEE,
  } as const
}

export function leaveQueueArgs() {
  return {
    address: PIXEL_ROYALE_ADDRESS,
    abi: pixelRoyaleAbi,
    functionName: 'leaveQueue',
  } as const
}

export function approveSessionKeyArgs(sessionKey: Address, expiry: bigint) {
  return {
    address: PIXEL_ROYALE_ADDRESS,
    abi: pixelRoyaleAbi,
    functionName: 'approveSessionKey',
    args: [sessionKey, expiry],
  } as const
}

export function revokeSessionKeyArgs(sessionKey: Address) {
  return {
    address: PIXEL_ROYALE_ADDRESS,
    abi: pixelRoyaleAbi,
    functionName: 'revokeSessionKey',
    args: [sessionKey],
  } as const
}

export function claimRewardsArgs() {
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
