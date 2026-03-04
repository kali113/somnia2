'use client'

import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi'
import {
  approveSessionKeyArgs,
  revokeSessionKeyArgs,
  getIsValidSessionArgs,
  SOMNIA_FAUCET_URL,
} from '@/lib/somnia/contract'
import {
  createSessionWallet,
  restoreSessionWallet,
  destroySessionWallet,
  getSessionExpirySolidity,
  type SessionWallet,
} from '@/lib/somnia/session-wallet'
import { Key, Loader2, Shield, ShieldOff, ExternalLink } from 'lucide-react'
import { useState, useCallback, useEffect } from 'react'

export default function SessionKeyPanel() {
  const { address } = useAccount()
  const [session, setSession] = useState<SessionWallet | null>(null)
  const [timeLeft, setTimeLeft] = useState<string>('')

  const { writeContract: approveKey, data: approveHash, isPending: isApproving } = useWriteContract()
  const { writeContract: revokeKey, data: revokeHash, isPending: isRevoking } = useWriteContract()

  const { isLoading: approveConfirming } = useWaitForTransactionReceipt({ hash: approveHash })
  const { isLoading: revokeConfirming } = useWaitForTransactionReceipt({ hash: revokeHash })

  // Check on-chain session validity
  const { data: isValidOnChain, refetch: refetchSession } = useReadContract({
    ...getIsValidSessionArgs(
      address ?? '0x0000000000000000000000000000000000000000',
      session?.account.address ?? '0x0000000000000000000000000000000000000000'
    ),
    query: { enabled: !!address && !!session, refetchInterval: 10000 },
  })

  // Restore session on mount
  useEffect(() => {
    const restored = restoreSessionWallet()
    if (restored) setSession(restored)
  }, [])

  // Countdown timer
  useEffect(() => {
    if (!session) {
      setTimeLeft('')
      return
    }

    const update = () => {
      const remaining = session.expiry - Date.now()
      if (remaining <= 0) {
        setTimeLeft('Expired')
        destroySessionWallet()
        setSession(null)
        return
      }
      const mins = Math.floor(remaining / 60000)
      const secs = Math.floor((remaining % 60000) / 1000)
      setTimeLeft(`${mins}m ${secs}s`)
    }

    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [session])

  // Refetch on-chain session after approve/revoke confirms
  useEffect(() => {
    if (approveHash || revokeHash) {
      const timer = setTimeout(() => refetchSession(), 3000)
      return () => clearTimeout(timer)
    }
  }, [approveHash, revokeHash, refetchSession])

  const handleCreateSession = useCallback(() => {
    const newSession = createSessionWallet(3600_000) // 1 hour
    setSession(newSession)

    if (address) {
      approveKey(
        approveSessionKeyArgs(
          newSession.account.address,
          getSessionExpirySolidity(newSession)
        )
      )
    }
  }, [address, approveKey])

  const handleRevokeSession = useCallback(() => {
    if (session && address) {
      revokeKey(revokeSessionKeyArgs(session.account.address))
      destroySessionWallet()
      setSession(null)
    }
  }, [session, address, revokeKey])

  const isBusy = isApproving || isRevoking || approveConfirming || revokeConfirming

  if (!address) {
    return (
      <div className="rounded-xl border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] p-6">
        <div className="flex items-center gap-2 mb-3">
          <Key className="h-4 w-4 text-[rgba(255,255,255,0.5)]" />
          <h3 className="font-mono font-bold text-white text-sm">Session Key</h3>
        </div>
        <p className="text-xs font-mono text-[rgba(255,255,255,0.3)] text-center py-2">
          Connect wallet to manage sessions
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] p-6">
      <div className="flex items-center gap-2 mb-4">
        <Key className="h-4 w-4 text-[rgba(255,255,255,0.5)]" />
        <h3 className="font-mono font-bold text-white text-sm">Session Key</h3>
      </div>

      <p className="text-[11px] font-mono text-[rgba(255,255,255,0.35)] mb-4 leading-relaxed">
        Session keys let you play without signing every in-game transaction.
        A temporary wallet is created in your browser and approved on-chain.
      </p>

      {session ? (
        <div className="space-y-3">
          <div className="rounded-lg bg-[rgba(0,0,0,0.3)] p-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-mono text-[rgba(255,255,255,0.4)] uppercase">Status</span>
              <div className="flex items-center gap-1.5">
                {isValidOnChain ? (
                  <>
                    <Shield className="h-3 w-3 text-[#4cff4c]" />
                    <span className="text-[10px] font-mono text-[#4cff4c]">Active</span>
                  </>
                ) : (
                  <>
                    <ShieldOff className="h-3 w-3 text-[#ff8c00]" />
                    <span className="text-[10px] font-mono text-[#ff8c00]">Pending Approval</span>
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono text-[rgba(255,255,255,0.4)] uppercase">Expires</span>
              <span className="text-xs font-mono text-white">{timeLeft}</span>
            </div>
          </div>

          <button
            onClick={handleRevokeSession}
            disabled={isBusy}
            className="w-full rounded-lg bg-[rgba(255,68,68,0.1)] border border-[rgba(255,68,68,0.2)] px-4 py-2.5 font-mono text-xs text-[#ff4444] hover:bg-[rgba(255,68,68,0.2)] transition-colors disabled:opacity-50"
          >
            {isBusy ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Processing...
              </span>
            ) : (
              'Revoke Session Key'
            )}
          </button>
        </div>
      ) : (
        <button
          onClick={handleCreateSession}
          disabled={isBusy}
          className="w-full rounded-lg bg-[rgba(58,232,255,0.1)] border border-[rgba(58,232,255,0.2)] px-4 py-3 font-mono text-xs font-bold text-[#3ae8ff] hover:bg-[rgba(58,232,255,0.2)] transition-colors disabled:opacity-50"
        >
          {isBusy ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Approving...
            </span>
          ) : (
            'Create Session Key (1 hour)'
          )}
        </button>
      )}
    </div>
  )
}
