'use client'

import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import {
  getPendingRewardsArgs,
  claimRewardsArgs,
  formatSTT,
  getPlayerStatsArgs,
  IS_PIXEL_ROYALE_CONFIGURED,
} from '@/lib/somnia/contract'
import { Gift, Loader2, Coins } from 'lucide-react'
import { useCallback, useEffect } from 'react'

export default function RewardsPanel() {
  const { address } = useAccount()

  const { data: pendingRewards, refetch: refetchRewards } = useReadContract({
    ...getPendingRewardsArgs(address ?? '0x0000000000000000000000000000000000000000'),
    query: { enabled: !!address && IS_PIXEL_ROYALE_CONFIGURED, refetchInterval: 10000 },
  })

  const { data: rawStats } = useReadContract({
    ...getPlayerStatsArgs(address ?? '0x0000000000000000000000000000000000000000'),
    query: { enabled: !!address && IS_PIXEL_ROYALE_CONFIGURED, refetchInterval: 15000 },
  })

  const { writeContract: claim, data: claimHash, isPending: isClaiming, error: claimError } = useWriteContract()

  const { isLoading: claimConfirming } = useWaitForTransactionReceipt({
    hash: claimHash,
  })

  useEffect(() => {
    if (claimHash) {
      const timer = setTimeout(() => refetchRewards(), 3000)
      return () => clearTimeout(timer)
    }
  }, [claimHash, refetchRewards])

  const handleClaim = useCallback(() => {
    claim(claimRewardsArgs())
  }, [claim])

  const pending = typeof pendingRewards === 'bigint' ? pendingRewards : 0n
  const stats = rawStats as any
  const totalEarned = stats ? (stats.totalEarned ?? stats[3] ?? 0n) : 0n
  const hasPending = pending > 0n
  const isBusy = isClaiming || claimConfirming

  if (!address) {
    return (
      <div className="rounded-xl border border-[rgba(76,255,76,0.15)] bg-[rgba(76,255,76,0.03)] p-6">
        <h3 className="font-mono font-bold text-white text-sm mb-4">Rewards</h3>
        <p className="text-xs font-mono text-[rgba(255,255,255,0.3)] text-center py-4">
          Connect wallet to view rewards
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-[rgba(76,255,76,0.15)] bg-[rgba(76,255,76,0.03)] p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="rounded-lg bg-[rgba(76,255,76,0.15)] p-2.5">
          <Gift className="h-5 w-5 text-[#4cff4c]" />
        </div>
        <div>
          <h3 className="font-mono font-bold text-white text-sm">Rewards</h3>
          <p className="text-xs font-mono text-[rgba(255,255,255,0.4)]">Earn STT by winning</p>
        </div>
      </div>

      {/* Pending Rewards */}
      <div className="rounded-lg bg-[rgba(0,0,0,0.3)] p-4 mb-3">
        <span className="text-xs font-mono text-[rgba(255,255,255,0.4)]">Pending Rewards</span>
        <div className="flex items-center gap-2 mt-1">
          <Coins className="h-5 w-5 text-[#4cff4c]" />
          <p className="text-2xl font-mono font-bold text-[#4cff4c]">
            {formatSTT(pending)} STT
          </p>
        </div>
      </div>

      {/* Total Earned */}
      <div className="rounded-lg bg-[rgba(0,0,0,0.3)] p-4 mb-4">
        <span className="text-xs font-mono text-[rgba(255,255,255,0.4)]">Lifetime Earned</span>
        <p className="text-lg font-mono font-bold text-[#7b2dff] mt-0.5">
          {typeof totalEarned === 'bigint' ? formatSTT(totalEarned) : '0'} STT
        </p>
      </div>

      {/* Reward Distribution Info */}
      <div className="rounded-lg bg-[rgba(0,0,0,0.2)] p-3 mb-4">
        <span className="text-[10px] font-mono text-[rgba(255,255,255,0.3)] uppercase block mb-2">
          Prize Distribution
        </span>
        <div className="space-y-1 text-xs font-mono">
          <div className="flex justify-between">
            <span className="text-[#ffd700]">1st Place</span>
            <span className="text-[rgba(255,255,255,0.5)]">40% of pool</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[rgba(192,192,192,0.8)]">2nd Place</span>
            <span className="text-[rgba(255,255,255,0.5)]">25% of pool</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[rgba(205,127,50,0.8)]">3rd Place</span>
            <span className="text-[rgba(255,255,255,0.5)]">17.5% of pool</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[rgba(255,255,255,0.4)]">4th Place</span>
            <span className="text-[rgba(255,255,255,0.5)]">10% of pool</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[rgba(255,255,255,0.4)]">5th Place</span>
            <span className="text-[rgba(255,255,255,0.5)]">7.5% of pool</span>
          </div>
        </div>
      </div>

      {/* Claim Button */}
      <button
        onClick={handleClaim}
        disabled={!hasPending || isBusy}
        className={`w-full rounded-lg px-4 py-3 font-mono font-bold text-sm transition-all ${
          hasPending
            ? 'bg-[#4cff4c] text-[#050508] hover:scale-[1.02] active:scale-95'
            : 'bg-[rgba(255,255,255,0.05)] text-[rgba(255,255,255,0.2)] cursor-not-allowed'
        } disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        {isBusy ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Claiming...
          </span>
        ) : hasPending ? (
          `Claim ${formatSTT(pending)} STT`
        ) : (
          'No Rewards to Claim'
        )}
      </button>

      {claimError && (
        <div className="mt-2 rounded-lg bg-[rgba(255,68,68,0.1)] border border-[rgba(255,68,68,0.2)] p-2">
          <p className="text-[10px] font-mono text-[#ff4444]">
            {claimError.message?.slice(0, 100) || 'Claim failed'}
          </p>
        </div>
      )}
    </div>
  )
}
