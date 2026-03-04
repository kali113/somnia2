'use client'

import { useState, useCallback } from 'react'
import { SOMNIA_TESTNET } from '@/lib/somnia/config'
import { Wallet, ExternalLink, Check, X } from 'lucide-react'

interface WalletConnectProps {
  onConnect: (address: string) => void
  onDisconnect: () => void
  isConnected: boolean
  address: string | null
}

export default function WalletConnect({
  onConnect, onDisconnect, isConnected, address,
}: WalletConnectProps) {
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleConnect = useCallback(async () => {
    setConnecting(true)
    setError(null)

    try {
      // Check if MetaMask (or compatible wallet) is available
      const ethereum = (window as any).ethereum
      if (!ethereum) {
        setError('No wallet found. Install MetaMask to connect to Somnia Testnet.')
        setConnecting(false)
        return
      }

      // Request accounts
      const accounts = await ethereum.request({ method: 'eth_requestAccounts' })
      if (!accounts || accounts.length === 0) {
        setError('No accounts available')
        setConnecting(false)
        return
      }

      // Try to switch to Somnia Testnet
      try {
        await ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: `0x${SOMNIA_TESTNET.id.toString(16)}` }],
        })
      } catch (switchErr: any) {
        // Chain not added, try to add it
        if (switchErr.code === 4902) {
          await ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: `0x${SOMNIA_TESTNET.id.toString(16)}`,
              chainName: SOMNIA_TESTNET.name,
              rpcUrls: SOMNIA_TESTNET.rpcUrls.default.http,
              nativeCurrency: SOMNIA_TESTNET.nativeCurrency,
              blockExplorerUrls: [SOMNIA_TESTNET.blockExplorers.default.url],
            }],
          })
        } else {
          throw switchErr
        }
      }

      onConnect(accounts[0])
    } catch (err: any) {
      setError(err.message || 'Failed to connect wallet')
    } finally {
      setConnecting(false)
    }
  }, [onConnect])

  return (
    <div className="pointer-events-auto">
      {isConnected && address ? (
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-lg bg-[rgba(76,255,76,0.1)] px-3 py-1.5 border border-[rgba(76,255,76,0.3)]">
            <div className="h-2 w-2 rounded-full bg-[#4cff4c]" />
            <span className="text-[11px] font-mono text-[#4cff4c]">
              {address.slice(0, 6)}...{address.slice(-4)}
            </span>
          </div>
          <button
            onClick={onDisconnect}
            className="rounded-lg bg-[rgba(255,255,255,0.08)] p-1.5 text-[rgba(255,255,255,0.5)] hover:bg-[rgba(255,255,255,0.15)] transition-colors"
            aria-label="Disconnect wallet"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-end gap-1">
          <button
            onClick={handleConnect}
            disabled={connecting}
            className="flex items-center gap-2 rounded-lg bg-[rgba(255,255,255,0.08)] px-3 py-1.5 text-[11px] font-mono text-[rgba(255,255,255,0.7)] hover:bg-[rgba(255,255,255,0.15)] transition-colors border border-[rgba(255,255,255,0.1)] disabled:opacity-50"
          >
            <Wallet className="h-3.5 w-3.5" />
            {connecting ? 'Connecting...' : 'Connect to Somnia'}
          </button>
          {error && (
            <span className="text-[9px] font-mono text-[#ff4444] max-w-[200px] text-right">
              {error}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
