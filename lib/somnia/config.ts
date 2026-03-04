import { type Address } from 'viem'
import { configuredContractAddress } from './runtime-config'

// ── Somnia Testnet Configuration ────────────────────────────────────────────

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
      http: ['https://dream-rpc.somnia.network'],
      webSocket: ['wss://dream-rpc.somnia.network/ws'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Somnia Explorer',
      url: 'https://somnia-testnet.socialscan.io',
    },
  },
  testnet: true,
} as const

export const GAME_CONTRACT_ADDRESS: Address | null = configuredContractAddress

export const GAME_EVENTS_ABI = [
  {
    type: 'event',
    name: 'PlayerJoinedQueue',
    inputs: [
      { name: 'player', type: 'address', indexed: true },
      { name: 'queueSize', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'PlayerLeftQueue',
    inputs: [
      { name: 'player', type: 'address', indexed: true },
      { name: 'queueSize', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'GameStarted',
    inputs: [
      { name: 'gameId', type: 'uint256', indexed: true },
      { name: 'players', type: 'address[]', indexed: false },
      { name: 'prizePool', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'GameEnded',
    inputs: [
      { name: 'gameId', type: 'uint256', indexed: true },
      { name: 'winner', type: 'address', indexed: true },
      { name: 'placements', type: 'address[]', indexed: false },
      { name: 'prizePool', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'RewardClaimed',
    inputs: [
      { name: 'player', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'SessionKeyApproved',
    inputs: [
      { name: 'player', type: 'address', indexed: true },
      { name: 'sessionKey', type: 'address', indexed: true },
      { name: 'expiry', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'SessionKeyRevoked',
    inputs: [
      { name: 'player', type: 'address', indexed: true },
      { name: 'sessionKey', type: 'address', indexed: true },
    ],
  },
] as const
