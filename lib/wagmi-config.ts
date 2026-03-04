'use client'

import { http, createConfig } from 'wagmi'
import { defineChain } from 'viem'
import { injected } from 'wagmi/connectors'
import { SOMNIA_TESTNET } from '@/lib/somnia/config'

// ── Somnia Testnet Chain Definition ─────────────────────────────────────────
export const somniaTestnet = defineChain({
  id: SOMNIA_TESTNET.id,
  name: SOMNIA_TESTNET.name,
  nativeCurrency: {
    name: SOMNIA_TESTNET.nativeCurrency.name,
    symbol: SOMNIA_TESTNET.nativeCurrency.symbol,
    decimals: SOMNIA_TESTNET.nativeCurrency.decimals,
  },
  rpcUrls: {
    default: {
      http: SOMNIA_TESTNET.rpcUrls.default.http,
      webSocket: SOMNIA_TESTNET.rpcUrls.default.webSocket,
    },
  },
  blockExplorers: {
    default: {
      name: SOMNIA_TESTNET.blockExplorers.default.name,
      url: SOMNIA_TESTNET.blockExplorers.default.url,
    },
  },
  testnet: SOMNIA_TESTNET.testnet,
})

// ── Wagmi Config ────────────────────────────────────────────────────────────
export const wagmiConfig = createConfig({
  chains: [somniaTestnet],
  connectors: [
    injected({ target: 'metaMask' }),
  ],
  transports: {
    [somniaTestnet.id]: http(SOMNIA_TESTNET.rpcUrls.default.http[0]),
  },
  ssr: false,
})
