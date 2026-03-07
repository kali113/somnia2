'use client'

import { useCallback, useEffect, useState } from 'react'
import { Wallet, X } from 'lucide-react'
import { useAccount, useConnect, useDisconnect, useSwitchChain } from '@/lib/wagmi-shim'
import { somniaTestnet } from '@/lib/thirdweb-config'

interface WalletConnectProps {
  onConnect: (address: string) => void
  onDisconnect: () => void
  isConnected: boolean
  address: string | null
}

export default function WalletConnect({
  onConnect,
  onDisconnect,
  isConnected,
  address,
}: WalletConnectProps) {
  const { address: activeAddress, isConnected: walletConnected } = useAccount()
  const { connect, isPending: isConnecting, error: connectError } = useConnect()
  const { disconnect } = useDisconnect()
  const { switchChain } = useSwitchChain()

  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (walletConnected && activeAddress) {
      if (!isConnected || !address || address.toLowerCase() !== activeAddress.toLowerCase()) {
        onConnect(activeAddress)
      }
      return
    }

    if (!walletConnected && isConnected) {
      onDisconnect()
    }
  }, [walletConnected, activeAddress, isConnected, address, onConnect, onDisconnect])

  const handleConnect = useCallback(async () => {
    setError(null)
    try {
      await connect({ chainId: somniaTestnet.id })
      await switchChain({ chainId: somniaTestnet.id })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect wallet')
    }
  }, [connect, switchChain])

  const handleDisconnect = useCallback(() => {
    disconnect()
    onDisconnect()
  }, [disconnect, onDisconnect])

  const displayAddress = activeAddress ?? address
  const showConnected = !!displayAddress && (walletConnected || isConnected)
  const visibleError = error ?? connectError?.message ?? null

  return (
    <div className="pointer-events-auto">
      {showConnected ? (
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-lg bg-[rgba(76,255,76,0.1)] px-3 py-1.5 border border-[rgba(76,255,76,0.3)]">
            <div className="h-2 w-2 rounded-full bg-[#4cff4c]" />
            <span className="text-[11px] font-mono text-[#4cff4c]">
              {displayAddress.slice(0, 6)}...{displayAddress.slice(-4)}
            </span>
          </div>
          <button
            onClick={handleDisconnect}
            className="rounded-lg bg-[rgba(255,255,255,0.08)] p-1.5 text-[rgba(255,255,255,0.5)] hover:bg-[rgba(255,255,255,0.15)] transition-colors"
            aria-label="Disconnect wallet"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-end gap-1">
          <button
            onClick={() => { void handleConnect() }}
            disabled={isConnecting}
            className="flex items-center gap-2 rounded-lg bg-[rgba(255,255,255,0.08)] px-3 py-1.5 text-[11px] font-mono text-[rgba(255,255,255,0.7)] hover:bg-[rgba(255,255,255,0.15)] transition-colors border border-[rgba(255,255,255,0.1)] disabled:opacity-50"
          >
            <Wallet className="h-3.5 w-3.5" />
            {isConnecting ? 'Connecting...' : 'Connect to Somnia'}
          </button>
          {visibleError && (
            <span className="text-[9px] font-mono text-[#ff4444] max-w-[200px] text-right">
              {visibleError}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
