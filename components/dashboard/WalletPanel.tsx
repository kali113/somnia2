'use client'

import { useAccount, useBalance, useDisconnect, useConnect } from 'wagmi'
import { somniaTestnet } from '@/lib/wagmi-config'
import { truncateAddress, SOMNIA_FAUCET_URL } from '@/lib/somnia/contract'
import { Copy, ExternalLink, Wallet, LogOut, Check } from 'lucide-react'
import { useState, useCallback } from 'react'

export default function WalletPanel() {
  const { address, isConnected } = useAccount()
  const { connect, connectors } = useConnect()
  const { disconnect } = useDisconnect()
  const { data: balance } = useBalance({
    address,
    chainId: somniaTestnet.id,
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
          onClick={() => connect({ connector: connectors[0] })}
          className="w-full rounded-lg bg-[#3ae8ff] px-4 py-3 font-mono font-bold text-sm text-[#050508] transition-all hover:scale-[1.02] active:scale-95"
        >
          Connect MetaMask
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
          {balance && !isNaN(Number(balance.formatted)) ? `${Number(balance.formatted).toFixed(4)} STT` : '-- STT'}
        </p>
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
    </div>
  )
}
