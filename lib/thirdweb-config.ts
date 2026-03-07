'use client'

import { createThirdwebClient, defineChain } from 'thirdweb'
import { SOMNIA_TESTNET, SOMNIA_RPC_URL, SOMNIA_FAUCET_URL } from '@/lib/somnia/config'

export const THIRDWEB_CLIENT_ID =
  process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID ||
  '861167c2151e552a7a2c543d6b655559'

export const thirdwebClient = createThirdwebClient({
  clientId: THIRDWEB_CLIENT_ID,
})

export const somniaTestnet = defineChain({
  id: SOMNIA_TESTNET.id,
  name: SOMNIA_TESTNET.name,
  rpc: SOMNIA_RPC_URL,
  nativeCurrency: SOMNIA_TESTNET.nativeCurrency,
  blockExplorers: [
    {
      name: SOMNIA_TESTNET.blockExplorers.default.name,
      url: SOMNIA_TESTNET.blockExplorers.default.url,
    },
  ],
  testnet: true,
  faucets: [SOMNIA_FAUCET_URL],
})
