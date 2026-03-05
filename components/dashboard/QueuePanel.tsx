'use client'

import {
  useAccount,
  useBalance,
  useChainId,
  useReadContract,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from '@/lib/wagmi-shim'
import { somniaTestnet } from '@/lib/thirdweb-config'
import {
  getIsValidSessionArgs,
  getQueueSizeArgs,
  getQueuePlayersArgs,
  getInQueueArgs,
  joinQueueArgs,
  leaveQueueArgs,
  ENTRY_FEE,
  MIN_QUEUE_BALANCE,
  IS_PIXEL_ROYALE_CONFIGURED,
  truncateAddress,
  SOMNIA_FAUCET_URL,
} from '@/lib/somnia/contract'
import { restoreSessionWallet, SESSION_UPDATED_EVENT } from '@/lib/somnia/session-wallet'
import { Loader2, AlertTriangle, ExternalLink, Swords } from 'lucide-react'
import { useEffect, useCallback, useState } from 'react'
import { formatEther, type Address } from 'viem'

export default function QueuePanel() {
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const isOnSomnia = chainId === somniaTestnet.id
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

  const [sessionAddress, setSessionAddress] = useState<Address | null>(
    () => restoreSessionWallet()?.account.address ?? null,
  )

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('preferredGameMode', 'solo')
    }
  }, [])

  useEffect(() => {
    const handleSessionChanged = () => {
      const session = restoreSessionWallet()
      setSessionAddress(session?.account.address ?? null)
    }

    window.addEventListener(SESSION_UPDATED_EVENT, handleSessionChanged)
    return () => {
      window.removeEventListener(SESSION_UPDATED_EVENT, handleSessionChanged)
    }
  }, [])

  // ── Read contract state ───────────────────────────────────────────────
  const { data: queueSize, refetch: refetchQueueSize } = useReadContract({
    ...getQueueSizeArgs(),
    query: { enabled: IS_PIXEL_ROYALE_CONFIGURED, refetchInterval: 5000 },
  })

  const { data: queuePlayers, refetch: refetchQueuePlayers } = useReadContract({
    ...getQueuePlayersArgs(),
    query: { enabled: IS_PIXEL_ROYALE_CONFIGURED, refetchInterval: 5000 },
  })

  const { data: isInQueue, refetch: refetchInQueue } = useReadContract({
    ...getInQueueArgs(address ?? '0x0000000000000000000000000000000000000000'),
    query: { enabled: !!address && IS_PIXEL_ROYALE_CONFIGURED, refetchInterval: 5000 },
  })

  const { data: isValidSession } = useReadContract({
    ...getIsValidSessionArgs(
      address ?? '0x0000000000000000000000000000000000000000',
      sessionAddress ?? '0x0000000000000000000000000000000000000000'
    ),
    query: {
      enabled: !!address && !!sessionAddress && IS_PIXEL_ROYALE_CONFIGURED,
      refetchInterval: 5_000,
    },
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

  const currentQueueSize = queueSize ? Number(queueSize) : 0
  const hasEnoughBalance = balance ? balance.value >= MIN_QUEUE_BALANCE : false
  const hasSessionWallet = !!sessionAddress
  const hasSessionConfigured = hasSessionWallet && isValidSession === true
  const playerInQueue = isInQueue === true
  const isBusy = isJoining || isLeaving || joinConfirming || leaveConfirming

  // Queue progress percentage
  const queueProgress = (currentQueueSize / 20) * 100

  // ── Handlers ──────────────────────────────────────────────────────────
  const handleJoinQueue = useCallback(() => {
    if (!IS_PIXEL_ROYALE_CONFIGURED) return
    if (!isOnSomnia) return
    if (!hasSessionConfigured) return
    if (!hasEnoughBalance) return
    joinQueue(joinQueueArgs())
  }, [joinQueue, isOnSomnia, hasSessionConfigured, hasEnoughBalance])

  const handleLeaveQueue = useCallback(() => {
    if (!IS_PIXEL_ROYALE_CONFIGURED) return
    leaveQueue(leaveQueueArgs())
  }, [leaveQueue])

  return (
    <div className="rounded-xl border border-[rgba(255,215,0,0.15)] bg-[rgba(255,215,0,0.03)] p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="rounded-lg bg-[rgba(255,215,0,0.15)] p-2.5">
          <Swords className="h-5 w-5 text-[#ffd700]" />
        </div>
        <div>
          <h3 className="font-mono font-bold text-white text-sm">Battle Queue</h3>
          <p className="text-xs font-mono text-[rgba(255,255,255,0.4)]">
            Entry: {formatEther(ENTRY_FEE)} STT • Min balance: {formatEther(MIN_QUEUE_BALANCE)} STT
          </p>
        </div>
      </div>

      <div className="mb-4 rounded-lg border border-[rgba(255,215,0,0.18)] bg-[rgba(255,255,255,0.03)] p-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[10px] font-mono text-[rgba(255,255,255,0.3)] uppercase">Game Mode</span>
          <span className="rounded-md border border-[rgba(255,215,0,0.35)] bg-[rgba(255,215,0,0.15)] px-2 py-1 text-[10px] font-mono font-bold text-[#ffd700]">
            SOLO ONLY
          </span>
        </div>
        <p className="mt-2 text-[10px] font-mono text-[rgba(255,255,255,0.4)]">
          Matchmaking is currently limited to solo queue.
        </p>
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
      ) : !isOnSomnia ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-lg bg-[rgba(255,140,0,0.12)] border border-[rgba(255,140,0,0.25)] p-3">
            <AlertTriangle className="h-4 w-4 text-[#ffb347] flex-shrink-0" />
            <p className="text-xs font-mono text-[#ffb347]">
              Wrong network. Switch to Somnia Testnet (50312) to queue.
            </p>
          </div>
          <button
            onClick={() => switchChain({ chainId: somniaTestnet.id })}
            disabled={isSwitchingChain}
            className="w-full rounded-lg bg-[rgba(58,232,255,0.16)] border border-[rgba(58,232,255,0.3)] px-4 py-3 font-mono font-bold text-sm text-[#3ae8ff] hover:bg-[rgba(58,232,255,0.22)] transition-colors disabled:opacity-50"
          >
            {isSwitchingChain ? 'Switching...' : 'Switch to Somnia'}
          </button>
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
      ) : !hasSessionWallet ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-lg bg-[rgba(255,140,0,0.12)] border border-[rgba(255,140,0,0.25)] p-3">
            <AlertTriangle className="h-4 w-4 text-[#ffb347] flex-shrink-0" />
            <p className="text-xs font-mono text-[#ffb347]">
              Session key required. Create it in the Session Key panel before joining queue.
            </p>
          </div>
          <button
            disabled
            className="w-full rounded-lg bg-[rgba(255,255,255,0.05)] px-4 py-3 font-mono font-bold text-sm text-[rgba(255,255,255,0.3)] cursor-not-allowed"
          >
            Queue Locked: Session Key Required
          </button>
        </div>
      ) : !hasSessionConfigured ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-lg bg-[rgba(255,140,0,0.12)] border border-[rgba(255,140,0,0.25)] p-3">
            <AlertTriangle className="h-4 w-4 text-[#ffb347] flex-shrink-0" />
            <p className="text-xs font-mono text-[#ffb347]">
              Session key found, but on-chain approval is still pending. Wait a moment, then try again.
            </p>
          </div>
          <button
            disabled
            className="w-full rounded-lg bg-[rgba(255,255,255,0.05)] px-4 py-3 font-mono font-bold text-sm text-[rgba(255,255,255,0.3)] cursor-not-allowed"
          >
            Waiting for Session Approval
          </button>
        </div>
      ) : isBalancePending ? (
        <div className="flex items-center justify-center gap-2 rounded-lg bg-[rgba(255,255,255,0.05)] p-3">
          <Loader2 className="h-4 w-4 animate-spin text-[rgba(255,255,255,0.5)]" />
          <p className="text-xs font-mono text-[rgba(255,255,255,0.45)]">Loading STT balance...</p>
        </div>
      ) : isBalanceError ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-lg bg-[rgba(255,68,68,0.1)] border border-[rgba(255,68,68,0.2)] p-3">
            <AlertTriangle className="h-4 w-4 text-[#ff4444] flex-shrink-0" />
            <p className="text-xs font-mono text-[#ff4444]">
              Could not load STT balance from RPC. Please refresh and try again.
            </p>
          </div>
        </div>
      ) : !hasEnoughBalance ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-lg bg-[rgba(255,68,68,0.1)] border border-[rgba(255,68,68,0.2)] p-3">
            <AlertTriangle className="h-4 w-4 text-[#ff4444] flex-shrink-0" />
            <p className="text-xs font-mono text-[#ff4444]">
              Insufficient STT balance. You need at least {formatEther(MIN_QUEUE_BALANCE)} STT (entry + gas reserve).
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
      ) : (
        <button
          onClick={handleJoinQueue}
          disabled={isBusy || currentQueueSize >= 20 || !isOnSomnia || !hasSessionConfigured || !hasEnoughBalance}
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
              `QUEUE FOR BATTLE (${formatEther(ENTRY_FEE)} STT entry)`
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
