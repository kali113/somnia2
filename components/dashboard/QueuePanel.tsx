'use client'

import { useAccount, useBalance, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { somniaTestnet } from '@/lib/wagmi-config'
import {
  getQueueSizeArgs,
  getQueuePlayersArgs,
  getInQueueArgs,
  joinQueueArgs,
  leaveQueueArgs,
  ENTRY_FEE,
  truncateAddress,
  SOMNIA_FAUCET_URL,
} from '@/lib/somnia/contract'
import { Users, Loader2, AlertTriangle, ExternalLink, Swords } from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'
import { formatEther } from 'viem'

export default function QueuePanel() {
  const { address, isConnected } = useAccount()
  const { data: balance } = useBalance({
    address,
    chainId: somniaTestnet.id,
  })

  // ── Read contract state ───────────────────────────────────────────────
  const { data: queueSize, refetch: refetchQueueSize } = useReadContract({
    ...getQueueSizeArgs(),
    query: { refetchInterval: 5000 },
  })

  const { data: queuePlayers, refetch: refetchQueuePlayers } = useReadContract({
    ...getQueuePlayersArgs(),
    query: { refetchInterval: 5000 },
  })

  const { data: isInQueue, refetch: refetchInQueue } = useReadContract({
    ...getInQueueArgs(address ?? '0x0000000000000000000000000000000000000000'),
    query: { enabled: !!address, refetchInterval: 5000 },
  })

  // ── Write contract ────────────────────────────────────────────────────
  const { writeContract: joinQueue, data: joinHash, isPending: isJoining, error: joinError } = useWriteContract()
  const { writeContract: leaveQueue, data: leaveHash, isPending: isLeaving, error: leaveError } = useWriteContract()

  const { isLoading: joinConfirming } = useWaitForTransactionReceipt({
    hash: joinHash,
  })

  const { isLoading: leaveConfirming } = useWaitForTransactionReceipt({
    hash: leaveHash,
  })

  // Refetch after tx confirms
  useEffect(() => {
    if (joinHash || leaveHash) {
      const timer = setTimeout(() => {
        refetchQueueSize()
        refetchQueuePlayers()
        refetchInQueue()
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [joinHash, leaveHash, refetchQueueSize, refetchQueuePlayers, refetchInQueue])

  // ── Handlers ──────────────────────────────────────────────────────────
  const handleJoinQueue = useCallback(() => {
    joinQueue(joinQueueArgs())
  }, [joinQueue])

  const handleLeaveQueue = useCallback(() => {
    leaveQueue(leaveQueueArgs())
  }, [leaveQueue])

  const currentQueueSize = queueSize ? Number(queueSize) : 0
  const hasEnoughBalance = balance ? balance.value >= ENTRY_FEE : false
  const playerInQueue = isInQueue === true
  const isBusy = isJoining || isLeaving || joinConfirming || leaveConfirming

  // Queue progress percentage
  const queueProgress = (currentQueueSize / 20) * 100

  return (
    <div className="rounded-xl border border-[rgba(255,215,0,0.15)] bg-[rgba(255,215,0,0.03)] p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="rounded-lg bg-[rgba(255,215,0,0.15)] p-2.5">
          <Swords className="h-5 w-5 text-[#ffd700]" />
        </div>
        <div>
          <h3 className="font-mono font-bold text-white text-sm">Battle Queue</h3>
          <p className="text-xs font-mono text-[rgba(255,255,255,0.4)]">
            Entry fee: {formatEther(ENTRY_FEE)} STT
          </p>
        </div>
      </div>

      {/* Queue Progress */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-mono text-[rgba(255,255,255,0.5)]">Players in Queue</span>
          <span className="text-sm font-mono font-bold text-[#ffd700]">
            {currentQueueSize}/20
          </span>
        </div>
        <div className="h-3 rounded-full bg-[rgba(0,0,0,0.4)] overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#ffd700] to-[#ff8c00] transition-all duration-500"
            style={{ width: `${queueProgress}%` }}
          />
        </div>
        {currentQueueSize >= 15 && (
          <p className="text-xs font-mono text-[#ffd700] mt-1 animate-pulse">
            Almost full! Game starting soon...
          </p>
        )}
      </div>

      {/* Queued Players List */}
      {queuePlayers && (queuePlayers as string[]).length > 0 && (
        <div className="mb-4 max-h-32 overflow-y-auto rounded-lg bg-[rgba(0,0,0,0.3)] p-3">
          <span className="text-[10px] font-mono text-[rgba(255,255,255,0.3)] uppercase mb-2 block">
            Queued Players
          </span>
          <div className="space-y-1">
            {(queuePlayers as string[]).map((player, i) => (
              <div
                key={player}
                className={`flex items-center gap-2 text-xs font-mono ${
                  player.toLowerCase() === address?.toLowerCase()
                    ? 'text-[#3ae8ff]'
                    : 'text-[rgba(255,255,255,0.5)]'
                }`}
              >
                <div className="h-1.5 w-1.5 rounded-full bg-[#4cff4c]" />
                <span>{truncateAddress(player)}</span>
                {player.toLowerCase() === address?.toLowerCase() && (
                  <span className="text-[10px] text-[#3ae8ff]">(you)</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      {!isConnected ? (
        <div className="rounded-lg bg-[rgba(255,255,255,0.05)] p-3 text-center">
          <p className="text-xs font-mono text-[rgba(255,255,255,0.4)]">
            Connect wallet to join the queue
          </p>
        </div>
      ) : !hasEnoughBalance ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-lg bg-[rgba(255,68,68,0.1)] border border-[rgba(255,68,68,0.2)] p-3">
            <AlertTriangle className="h-4 w-4 text-[#ff4444] flex-shrink-0" />
            <p className="text-xs font-mono text-[#ff4444]">
              Insufficient STT balance. You need at least {formatEther(ENTRY_FEE)} STT.
            </p>
          </div>
          <a
            href={SOMNIA_FAUCET_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full rounded-lg bg-[rgba(123,45,255,0.15)] border border-[rgba(123,45,255,0.3)] px-4 py-2.5 font-mono text-xs text-[#7b2dff] hover:bg-[rgba(123,45,255,0.25)] transition-colors"
          >
            Get STT from Faucet
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      ) : playerInQueue ? (
        <button
          onClick={handleLeaveQueue}
          disabled={isBusy}
          className="w-full rounded-lg bg-[rgba(255,68,68,0.15)] border border-[rgba(255,68,68,0.3)] px-4 py-3 font-mono font-bold text-sm text-[#ff4444] hover:bg-[rgba(255,68,68,0.25)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLeaving || leaveConfirming ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Leaving...
            </span>
          ) : (
            'Leave Queue'
          )}
        </button>
      ) : (
        <button
          onClick={handleJoinQueue}
          disabled={isBusy || currentQueueSize >= 20}
          className="group relative w-full"
        >
          <div className="absolute -inset-0.5 rounded-xl bg-[#ffd700] opacity-20 blur group-hover:opacity-40 transition-opacity" />
          <div className="relative w-full rounded-xl bg-gradient-to-r from-[#ffd700] to-[#ff8c00] px-4 py-4 font-mono font-black text-base text-[#050508] transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed">
            {isJoining || joinConfirming ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin" />
                Joining...
              </span>
            ) : currentQueueSize >= 20 ? (
              'Queue Full'
            ) : (
              `QUEUE FOR BATTLE (${formatEther(ENTRY_FEE)} STT)`
            )}
          </div>
        </button>
      )}

      {/* Error display */}
      {(joinError || leaveError) && (
        <div className="mt-3 rounded-lg bg-[rgba(255,68,68,0.1)] border border-[rgba(255,68,68,0.2)] p-3">
          <p className="text-xs font-mono text-[#ff4444]">
            {(joinError || leaveError)?.message?.slice(0, 100) || 'Transaction failed'}
          </p>
        </div>
      )}
    </div>
  )
}
