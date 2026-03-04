'use client'

import { http, createConfig, createStorage } from 'wagmi'
import { defineChain } from 'viem'
import { injected } from 'wagmi/connectors'

// ── Somnia Testnet Chain Definition ─────────────────────────────────────────
export const somniaTestnet = defineChain({
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
})

// ── Wagmi Config ────────────────────────────────────────────────────────────
export const wagmiConfig = createConfig({
  chains: [somniaTestnet],
  connectors: [
    injected(), // MetaMask, Rabby, etc.
  ],
  transports: {
    [somniaTestnet.id]: http('https://dream-rpc.somnia.network'),
  },
  ssr: false,
})
