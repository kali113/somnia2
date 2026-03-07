// ── Somnia Shannon Testnet Configuration ────────────────────────────────────
// Source: docs.somnia.network/developer/network-info

import deployment from '@/contracts/deployments/somnia-shannon-50312.json'

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const

// Ordered by reliability: Ankr and thirdweb are more stable than the default Somnia RPC.
export const SOMNIA_RPC_URLS: readonly string[] = [
  process.env.NEXT_PUBLIC_SOMNIA_RPC_URL || 'https://rpc.ankr.com/somnia_testnet',
  'https://50312.rpc.thirdweb.com',
  'https://dream-rpc.somnia.network',
]

export const SOMNIA_RPC_URL = SOMNIA_RPC_URLS[0]

export const SOMNIA_WS_URL =
  process.env.NEXT_PUBLIC_SOMNIA_WS_URL || 'wss://dream-rpc.somnia.network/ws'

export const SOMNIA_EXPLORER_URL =
  process.env.NEXT_PUBLIC_SOMNIA_EXPLORER_URL ||
  'https://shannon-explorer.somnia.network/'

export const SOMNIA_FAUCET_URL =
  process.env.NEXT_PUBLIC_SOMNIA_FAUCET_URL ||
  'https://cloud.google.com/application/web3/faucet/somnia/shannon'

const DEPLOYED_PIXEL_ROYALE_ADDRESS =
  (deployment.contract?.address || ZERO_ADDRESS) as `0x${string}`

export const SOMNIA_TESTNET = {
  id: 50312,
  name: 'Somnia Testnet',
  nativeCurrency: {
    name: 'Somnia Test Token',
    symbol: 'STT',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [...SOMNIA_RPC_URLS],
      webSocket: [SOMNIA_WS_URL],
    },
  },
  blockExplorers: {
    default: {
      name: 'Somnia Shannon Explorer',
      url: SOMNIA_EXPLORER_URL,
    },
  },
  testnet: true,
} as const

// ── Game Contract Address ───────────────────────────────────────────────────
// IMPORTANT: set NEXT_PUBLIC_PIXEL_ROYALE_ADDRESS to your deployed contract.

const rawGameContractAddress =
  process.env.NEXT_PUBLIC_PIXEL_ROYALE_ADDRESS ||
  process.env.NEXT_PUBLIC_GAME_CONTRACT_ADDRESS ||
  DEPLOYED_PIXEL_ROYALE_ADDRESS

const normalizedGameContractAddress = rawGameContractAddress.trim()

const looksLikeAddress = /^0x[a-fA-F0-9]{40}$/.test(normalizedGameContractAddress)

export const GAME_CONTRACT_ADDRESS =
  (looksLikeAddress ? normalizedGameContractAddress : ZERO_ADDRESS) as `0x${string}`

export const IS_GAME_CONTRACT_CONFIGURED =
  GAME_CONTRACT_ADDRESS.toLowerCase() !== ZERO_ADDRESS

// ── Event Topics (keccak256 hashes of event signatures) ─────────────────────

export const EVENT_TOPICS = {
  SupplyDrop: '0x' + 'a1b2c3d4e5f6'.padEnd(64, '0'),
  StormPhaseChanged: '0x' + 'b2c3d4e5f6a1'.padEnd(64, '0'),
  PlayerKillMilestone: '0x' + 'c3d4e5f6a1b2'.padEnd(64, '0'),
} as const

// ── ABI for game events ─────────────────────────────────────────────────────

export const GAME_EVENTS_ABI = [
  {
    type: 'event',
    name: 'SupplyDropEvent',
    inputs: [
      { name: 'x', type: 'uint256', indexed: false },
      { name: 'y', type: 'uint256', indexed: false },
      { name: 'rarity', type: 'uint8', indexed: false },
      { name: 'itemCount', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'StormPhaseChanged',
    inputs: [
      { name: 'phase', type: 'uint8', indexed: false },
      { name: 'centerX', type: 'uint256', indexed: false },
      { name: 'centerY', type: 'uint256', indexed: false },
      { name: 'radius', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'PlayerKillMilestone',
    inputs: [
      { name: 'player', type: 'address', indexed: true },
      { name: 'killCount', type: 'uint256', indexed: false },
    ],
  },
] as const
