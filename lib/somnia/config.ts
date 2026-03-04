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

// ── Game Contract (placeholder address for testnet deployment) ──────────────

export const GAME_CONTRACT_ADDRESS = '0x0000000000000000000000000000000000000000' as const

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
