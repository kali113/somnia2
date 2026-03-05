'use client'

import { http, createConfig } from 'wagmi'
import { defineChain, custom, fallback } from 'viem'
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
// Use MetaMask's injected provider as the primary transport so balance reads
// go through the same RPC MetaMask is using. Fall back to the public HTTP RPC.
const publicHttp = http(SOMNIA_TESTNET.rpcUrls.default.http[0])
const injectedProvider = typeof window !== 'undefined' ? (window as any).ethereum : undefined
const somniaTransport = injectedProvider
  ? fallback([custom(injectedProvider), publicHttp])
  : publicHttp

export const wagmiConfig = createConfig({
  chains: [somniaTestnet],
  connectors: [
    injected({ target: 'metaMask' }),
  ],
  transports: {
    [somniaTestnet.id]: somniaTransport,
  },
  ssr: false,
})
