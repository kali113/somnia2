'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThirdwebProvider, useAutoConnect } from 'thirdweb/react'
import { createWallet } from 'thirdweb/wallets'
import { thirdwebClient, somniaTestnet } from '@/lib/thirdweb-config'

const APP_METADATA = {
  name: 'Pixel Royale',
  url: 'https://kali113.github.io/somnia2',
  description: '2D battle royale powered by Somnia testnet',
  logoUrl: 'https://kali113.github.io/somnia2/icon.svg',
} as const

function ThirdwebAutoConnect() {
  const wallets = useMemo(
    () => [
      createWallet('io.metamask'),
      createWallet('com.coinbase.wallet'),
      createWallet('me.rainbow'),
    ],
    [],
  )

  useAutoConnect({
    client: thirdwebClient,
    wallets,
    timeout: 10_000,
    chain: somniaTestnet,
    appMetadata: APP_METADATA,
  })

  return null
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())

  return (
    <QueryClientProvider client={queryClient}>
      <ThirdwebProvider>
        <ThirdwebAutoConnect />
        {children}
      </ThirdwebProvider>
    </QueryClientProvider>
  )
}
