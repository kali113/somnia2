'use client'

import {
  useAccount,
  useBalance,
  useChainId,
  useConnect,
  useDisconnect,
  useSwitchChain,
} from 'wagmi'
import { somniaTestnet } from '@/lib/wagmi-config'
import {
  truncateAddress,
  SOMNIA_FAUCET_URL,
  IS_PIXEL_ROYALE_CONFIGURED,
  PIXEL_ROYALE_ADDRESS,
} from '@/lib/somnia/contract'
import { SOMNIA_EXPLORER_URL } from '@/lib/somnia/config'
import { Copy, ExternalLink, Wallet, LogOut, Check, AlertTriangle, Loader2 } from 'lucide-react'
import { useState, useCallback } from 'react'

export default function WalletPanel() {
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const isOnSomnia = chainId === somniaTestnet.id
  const { connect, connectors } = useConnect()
  const { disconnect } = useDisconnect()
  const { switchChain, isPending: isSwitchingChain } = useSwitchChain()
  const {
    data: balance,
    isPending: isBalancePending,
    isError: isBalanceError,
  } = useBalance({
    address,
    chainId: somniaTestnet.id,
    query: {
      enabled: !!address,
      refetchInterval: 8_000,
      retry: 2,
    },
  })

  const [copied, setCopied] = useState(false)

  const copyAddress = useCallback(() => {
    if (!address) return
    navigator.clipboard.writeText(address)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [address])

  if (!isConnected || !address) {
    return (
      <div className="rounded-xl border border-[rgba(58,232,255,0.15)] bg-[rgba(58,232,255,0.03)] p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="rounded-lg bg-[rgba(58,232,255,0.15)] p-2.5">
            <Wallet className="h-5 w-5 text-[#3ae8ff]" />
          </div>
          <div>
            <h3 className="font-mono font-bold text-white text-sm">Connect Wallet</h3>
            <p className="text-xs font-mono text-[rgba(255,255,255,0.4)]">Connect to play on Somnia</p>
          </div>
        </div>
        <button
          onClick={() => {
            if (connectors[0]) {
              connect({ connector: connectors[0] })
            }
          }}
          disabled={!connectors[0]}
          className="w-full rounded-lg bg-[#3ae8ff] px-4 py-3 font-mono font-bold text-sm text-[#050508] transition-all hover:scale-[1.02] active:scale-95"
        >
          {connectors[0] ? 'Connect MetaMask' : 'No Wallet Found'}
        </button>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-[rgba(58,232,255,0.15)] bg-[rgba(58,232,255,0.03)] p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-[rgba(58,232,255,0.15)] p-2.5">
            <Wallet className="h-5 w-5 text-[#3ae8ff]" />
          </div>
          <div>
            <h3 className="font-mono font-bold text-white text-sm">Wallet</h3>
            <div className="flex items-center gap-1.5">
              <div className="h-1.5 w-1.5 rounded-full bg-[#4cff4c]" />
              <span className="text-xs font-mono text-[rgba(255,255,255,0.5)]">Connected</span>
            </div>
          </div>
        </div>
        <button
          onClick={() => disconnect()}
          className="rounded-lg bg-[rgba(255,68,68,0.1)] p-2 text-[#ff4444] hover:bg-[rgba(255,68,68,0.2)] transition-colors"
          title="Disconnect"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>

      {!isOnSomnia && (
        <div className="rounded-lg bg-[rgba(255,140,0,0.12)] border border-[rgba(255,140,0,0.25)] px-4 py-3 mb-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-mono text-[#ffb347]">Wrong network. Switch to Somnia Testnet (50312).</p>
            <button
              onClick={() => switchChain({ chainId: somniaTestnet.id })}
              disabled={isSwitchingChain}
              className="rounded-md bg-[rgba(58,232,255,0.15)] px-2.5 py-1 text-[10px] font-mono font-bold text-[#3ae8ff] disabled:opacity-50"
            >
              {isSwitchingChain ? 'Switching...' : 'Switch'}
            </button>
          </div>
        </div>
      )}

      {/* Address */}
      <div className="rounded-lg bg-[rgba(0,0,0,0.3)] px-4 py-3 mb-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono text-[rgba(255,255,255,0.4)]">Address</span>
          <button
            onClick={copyAddress}
            className="text-[rgba(255,255,255,0.4)] hover:text-white transition-colors"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-[#4cff4c]" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        </div>
        <p className="text-sm font-mono text-white mt-1">{truncateAddress(address, 6)}</p>
      </div>

      {/* Balance */}
      <div className="rounded-lg bg-[rgba(0,0,0,0.3)] px-4 py-3 mb-3">
        <span className="text-xs font-mono text-[rgba(255,255,255,0.4)]">Balance</span>
        <p className="text-lg font-mono font-bold text-[#3ae8ff] mt-0.5">
          {isBalancePending
            ? 'Loading...'
            : balance
            ? `${Number(balance.formatted).toFixed(4)} STT`
            : isBalanceError
            ? 'RPC Unavailable'
            : '-- STT'}
        </p>
        {isBalancePending && <Loader2 className="h-3.5 w-3.5 mt-1 animate-spin text-[rgba(255,255,255,0.35)]" />}
      </div>

      {/* Faucet Link */}
      <a
        href={SOMNIA_FAUCET_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 w-full rounded-lg bg-[rgba(123,45,255,0.15)] border border-[rgba(123,45,255,0.3)] px-4 py-2.5 font-mono text-xs text-[#7b2dff] hover:bg-[rgba(123,45,255,0.25)] transition-colors"
      >
        Need STT? Get from Faucet
        <ExternalLink className="h-3.5 w-3.5" />
      </a>

      <div className="mt-3 rounded-lg bg-[rgba(0,0,0,0.3)] px-4 py-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-mono text-[rgba(255,255,255,0.4)]">Game Contract</span>
          {IS_PIXEL_ROYALE_CONFIGURED ? (
            <a
              href={`${SOMNIA_EXPLORER_URL.replace(/\/$/, '')}/address/${PIXEL_ROYALE_ADDRESS}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[rgba(58,232,255,0.7)] hover:text-[#3ae8ff] transition-colors"
              title="View contract on explorer"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          ) : (
            <AlertTriangle className="h-3.5 w-3.5 text-[#ff4444]" />
          )}
        </div>
        <p className={`text-xs font-mono ${IS_PIXEL_ROYALE_CONFIGURED ? 'text-[rgba(255,255,255,0.75)]' : 'text-[#ff7b7b]'}`}>
          {truncateAddress(PIXEL_ROYALE_ADDRESS, 6)}
        </p>
      </div>
    </div>
  )
}
