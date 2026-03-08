'use client'

import { Suspense, useState, useRef, useCallback, useEffect, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { useSearchParams, useRouter } from 'next/navigation'
import {
  confirmVerifiedContainerOpen,
  confirmStormCircleCommit,
  fallbackStormCircleCommit,
  rejectVerifiedContainerOpen,
  type GameState, type GamePhase, type KillFeedEntry, type ContainerPromptState, type ContainerVerificationRequest, type StormCommitRequest,
} from '@/lib/game/engine'
import type { Player } from '@/lib/game/player'
import type { GameMode } from '@/lib/game/constants'
import type { StormState } from '@/lib/game/storm'
import { createConnectionEvent, type SomniaEvent } from '@/lib/somnia/events'
import { createReactivityConnection } from '@/lib/somnia/reactivity'
import { fetchMatchById, type MatchRecord } from '@/lib/somnia/matchmaking-client'
import { isBackendConfigured, backendConfigError } from '@/lib/somnia/runtime-config'
import { openContainerVerifiedOnChain } from '@/lib/somnia/chest-log'
import { commitStormCircleOnChain } from '@/lib/somnia/storm-log'
import { submitGameResult, botPlaceholderAddress } from '@/lib/somnia/game-result'
import GameHUD from '@/components/game/GameHUD'
import KillFeed from '@/components/game/KillFeed'
import VictoryScreen from '@/components/game/VictoryScreen'
import EventFeed from '@/components/game/EventFeed'
import MobileControls from '@/components/game/MobileControls'
import WalletConnect from '@/components/game/WalletConnect'
import { Volume2, VolumeX } from 'lucide-react'
import { activateAudio, setMuted, isMuted } from '@/lib/game/audio'
import { tapVirtualKey } from '@/lib/game/input'
import { useAccount } from '@/lib/wagmi-shim'

const GameCanvas = dynamic(() => import('@/components/game/GameCanvas'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[100dvh] w-full items-center justify-center bg-[#0a0a0a]">
      <div className="text-center">
        <div className="text-2xl font-black font-mono text-[#3ae8ff] mb-2">LOADING...</div>
        <div className="text-sm font-mono text-[rgba(255,255,255,0.4)]">Preparing match...</div>
      </div>
    </div>
  ),
})

type ContainerTxToast = {
  kind: 'pending' | 'success' | 'error'
  message: string
}

function GamePageInner() {
  const { address: connectedAddress, isConnected: isWalletConnected } = useAccount()
  const searchParams = useSearchParams()
  const router = useRouter()
  const gameStateRef = useRef<GameState | null>(null)
  const reactivityRef = useRef<ReturnType<typeof createReactivityConnection> | null>(null)
  const resultSubmittedRef = useRef(false)

  const matchIdParam = searchParams.get('matchId')
  const parsedMatchId = matchIdParam ? Number(matchIdParam) : NaN
  const isMatchMode = Number.isFinite(parsedMatchId)

  const gameMode: GameMode = 'solo'

  useEffect(() => {
    localStorage.setItem('preferredGameMode', 'solo')
  }, [])

  const [match, setMatch] = useState<MatchRecord | null>(null)
  const [matchError, setMatchError] = useState<string | null>(null)

  // UI state
  const [player, setPlayer] = useState<Player | null>(null)
  const [aliveCount, setAliveCount] = useState(25)
  const [phase, setPhase] = useState<GamePhase>('playing')
  const [storm, setStorm] = useState<StormState | null>(null)
  const [killFeed, setKillFeed] = useState<KillFeedEntry[]>([])
  const [gameTime, setGameTime] = useState(0)
  const [placement, setPlacement] = useState(0)
  const [containerPrompt, setContainerPrompt] = useState<ContainerPromptState | null>(null)

  // Somnia state
  const [somniaEvents, setSomniaEvents] = useState<SomniaEvent[]>([])
  const [walletAddress, setWalletAddress] = useState<string | null>(connectedAddress ?? null)
  const [isLiveMode, setIsLiveMode] = useState(false)
  const [containerTxToast, setContainerTxToast] = useState<ContainerTxToast | null>(null)
  const [resultSubmitting, setResultSubmitting] = useState(false)
  const [resultTxHash, setResultTxHash] = useState<string | null>(null)
  const [resultError, setResultError] = useState<string | null>(null)

  useEffect(() => {
    if (isWalletConnected && connectedAddress) {
      setWalletAddress(connectedAddress)
      return
    }

    if (!isWalletConnected) {
      setWalletAddress(null)
    }
  }, [connectedAddress, isWalletConnected])

  // Audio
  const [muted, setMutedState] = useState(() => isMuted())
  const [touchControls, setTouchControls] = useState(false)

  const botCount = useMemo(() => {
    if (isMatchMode) {
      return Math.max(1, (match?.totalSlots ?? 20) - 1)
    }
    return 24
  }, [isMatchMode, match?.totalSlots])

  useEffect(() => {
    let cancelled = false

    async function loadMatch() {
      if (!isMatchMode) {
        setMatch(null)
        setMatchError(null)
        return
      }

      if (!isBackendConfigured) {
        setMatchError(backendConfigError)
        return
      }

      try {
        const nextMatch = await fetchMatchById(parsedMatchId)
        if (cancelled) {return}
        setMatch(nextMatch)
        setMatchError(null)
      } catch (error) {
        if (cancelled) {return}
        const message = error instanceof Error ? error.message : String(error)
        setMatchError(message)
      }
    }

    loadMatch().catch(() => undefined)

    return () => {
      cancelled = true
    }
  }, [isMatchMode, parsedMatchId])

  // Sync UI state from the authoritative engine state so end-of-match UI
  // still updates even if a React callback lags or is missed.
  useEffect(() => {
    const interval = setInterval(() => {
      const state = gameStateRef.current
      if (!state) {return}

      setAliveCount((prev) => (prev === state.aliveCount ? prev : state.aliveCount))
      setPhase((prev) => (prev === state.phase ? prev : state.phase))
      setPlacement((prev) => (prev === state.placement ? prev : state.placement))
      setGameTime((prev) => (Math.abs(prev - state.time) < 0.1 ? prev : state.time))
    }, 100)
    return () => { clearInterval(interval); }
  }, [])

  // Somnia event handler
  const handleSomniaEvent = useCallback((event: SomniaEvent) => {
    setSomniaEvents(prev => [event, ...prev].slice(0, 20))

    if (event.type === 'storm_committed' && gameStateRef.current) {
      const data = event.data as {
        gameId: number
        phase: number
        currentCenterX: number
        currentCenterY: number
        currentRadius: number
        targetCenterX: number
        targetCenterY: number
        targetRadius: number
        entropyHash: string
        timestamp: number
      }

      const activeGameId = gameStateRef.current.gameId
      if (data.gameId === activeGameId) {
        confirmStormCircleCommit(gameStateRef.current, {
          gameId: data.gameId,
          phase: data.phase,
          currentCenterX: data.currentCenterX,
          currentCenterY: data.currentCenterY,
          currentRadius: data.currentRadius,
          targetCenterX: data.targetCenterX,
          targetCenterY: data.targetCenterY,
          targetRadius: data.targetRadius,
          entropyHash: data.entropyHash,
          committedAt: data.timestamp,
          txHash: event.txHash ?? null,
        })
      }
    }
  }, [])

  // Wallet handlers
  const handleWalletConnect = useCallback((address: string) => {
    setWalletAddress(address)

    const conn = createReactivityConnection(handleSomniaEvent)
    reactivityRef.current = conn
    conn.connect().then(() => {
      setIsLiveMode(true)
    }).catch(() => {
      setIsLiveMode(false)
    })
  }, [handleSomniaEvent])

  const handleWalletDisconnect = useCallback(() => {
    setWalletAddress(null)
    setIsLiveMode(false)
    setContainerPrompt(null)

    reactivityRef.current?.disconnect()
    reactivityRef.current = null
  }, [])

  const pushSystemEvent = useCallback((event: SomniaEvent) => {
    setSomniaEvents((prev) => [event, ...prev].slice(0, 20))
  }, [])

  const handleContainerVerificationRequested = useCallback((request: ContainerVerificationRequest) => {
    if (!isWalletConnected || !walletAddress) {
      pushSystemEvent(createConnectionEvent('Wallet required for verified match container opens.', 'chain_error'))
      if (gameStateRef.current) {
        rejectVerifiedContainerOpen(gameStateRef.current, request.containerId)
      }
      setContainerTxToast({
        kind: 'error',
        message: 'Wallet required for verified container open.',
      })
      return
    }

    setContainerTxToast({
      kind: 'pending',
      message: 'Submitting container verification transaction...',
    })

    openContainerVerifiedOnChain(request).then(({ txHash, reason, reward }) => {
      if (!gameStateRef.current) {return}

      if (txHash && reward) {
        const applied = confirmVerifiedContainerOpen(gameStateRef.current, reward)
        if (applied) {
          pushSystemEvent(createConnectionEvent(`Container verified on-chain (${txHash.slice(0, 10)}...)`))
          setContainerTxToast({
            kind: 'success',
            message: `Container verified (${txHash.slice(0, 10)}...)`,
          })
        }
        return
      }

      rejectVerifiedContainerOpen(gameStateRef.current, request.containerId)
      pushSystemEvent(createConnectionEvent(
        `Container verification failed (${reason ?? 'unknown_error'})`,
        'chain_error',
      ))
      setContainerTxToast({
        kind: 'error',
        message: `Container verification failed (${reason ?? 'unknown_error'})`,
      })
    }).catch(() => {
      if (gameStateRef.current) {
        rejectVerifiedContainerOpen(gameStateRef.current, request.containerId)
      }
      pushSystemEvent(createConnectionEvent('Container verification failed', 'chain_error'))
      setContainerTxToast({
        kind: 'error',
        message: 'Container verification failed.',
      })
    })
  }, [isWalletConnected, pushSystemEvent, walletAddress])

  const handleStormCommitRequested = useCallback((request: StormCommitRequest) => {
    commitStormCircleOnChain(request).then(({ txHash, reason, commit }) => {
      if (!gameStateRef.current) {return}

      if (commit) {
        confirmStormCircleCommit(gameStateRef.current, {
          ...commit,
          txHash: commit.txHash ?? txHash,
        })
        return
      }

      fallbackStormCircleCommit(gameStateRef.current)
      pushSystemEvent(createConnectionEvent(
        `Storm commit failed (${reason ?? 'unknown_error'}); using local fallback`,
        'chain_error',
      ))
    }).catch(() => {
      if (!gameStateRef.current) {return}
      fallbackStormCircleCommit(gameStateRef.current)
      pushSystemEvent(createConnectionEvent(
        'Storm commit failed; using local fallback',
        'chain_error',
      ))
    })
  }, [pushSystemEvent])

  // Submit game result on-chain when a match-mode game ends
  useEffect(() => {
    if (
      (phase !== 'victory' && phase !== 'eliminated') ||
      !isMatchMode ||
      !walletAddress ||
      resultSubmittedRef.current
    ) {
      return
    }

    resultSubmittedRef.current = true
    const task = window.setTimeout(() => {
      void (async () => {
        setResultSubmitting(true)

        const state = gameStateRef.current
        if (!state) {
          setResultSubmitting(false)
          setResultError('Game state unavailable')
          return
        }

        const participants: { address: string; placement: number; kills: number }[] = []

        participants.push({
          address: walletAddress,
          placement: state.placement,
          kills: state.player.kills,
        })

        state.bots.forEach((bot, i) => {
          participants.push({
            address: botPlaceholderAddress(state.gameId, i),
            placement: bot.placement === 0 ? 1 : bot.placement,
            kills: bot.kills,
          })
        })

        participants.sort((a, b) => a.placement - b.placement)

        const placements = participants.map((participant) => participant.address)
        const kills = participants.map((participant) => participant.kills)

        try {
          const response = await submitGameResult({ gameId: state.gameId, placements, kills })
          if (response.success) {
            setResultSubmitting(false)
            setResultTxHash(response.txHash)
          } else {
            setResultSubmitting(false)
            setResultError(response.error ?? 'Unknown error')
          }
        } catch (err) {
          setResultSubmitting(false)
          setResultError(err instanceof Error ? err.message : 'Unknown error')
        }
      })()
    }, 0)

    return () => {
      window.clearTimeout(task)
    }
  }, [phase, isMatchMode, walletAddress])

  useEffect(() => {
    if (!containerTxToast || containerTxToast.kind === 'pending') {return}
    const timer = setTimeout(() => { setContainerTxToast(null); }, 4200)
    return () => { clearTimeout(timer); }
  }, [containerTxToast])

  useEffect(() => {
    return () => {
      reactivityRef.current?.disconnect()
    }
  }, [])

  useEffect(() => {
    const media = window.matchMedia('(pointer: coarse)')
    const updateTouchControls = () => {
      setTouchControls(media.matches || window.navigator.maxTouchPoints > 0)
    }

    updateTouchControls()
    media.addEventListener('change', updateTouchControls)
    window.addEventListener('orientationchange', updateTouchControls)

    return () => {
      media.removeEventListener('change', updateTouchControls)
      window.removeEventListener('orientationchange', updateTouchControls)
    }
  }, [])

  // Game callbacks
  const handlePlayAgain = useCallback(() => {
    window.location.reload()
  }, [])

  const handleBackToMenu = useCallback(() => {
    router.push('/')
  }, [router])

  const toggleMute = useCallback(() => {
    const newMuted = !muted
    setMutedState(newMuted)
    setMuted(newMuted)
    if (!newMuted) {
      void activateAudio()
    }
  }, [muted])

  const handleSelectSlot = useCallback((slotIndex: number) => {
    const state = gameStateRef.current
    if (!state) {return}
    tapVirtualKey(state.input, String(slotIndex + 1))
  }, [])

  const canStartGame = !isMatchMode || isWalletConnected
  const showWalletControl = !touchControls || isMatchMode || isWalletConnected
  const matchBannerTop = 'calc(env(safe-area-inset-top) + 0.75rem)'
  const utilityBarTop = touchControls
    ? `calc(env(safe-area-inset-top) + ${isMatchMode ? '3.75rem' : '0.75rem'})`
    : '0.75rem'

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-[#0a0a0a]">
      {isMatchMode && (
        <div
          className="absolute left-1/2 z-20 max-w-[calc(100vw-24px)] -translate-x-1/2 rounded-lg border border-[rgba(58,232,255,0.2)] bg-[rgba(0,0,0,0.7)] px-4 py-2 text-center backdrop-blur-sm"
          style={{ top: matchBannerTop }}
        >
          <p className="text-[10px] font-mono text-[rgba(255,255,255,0.5)] uppercase">Matchmaking</p>
          {matchError ? (
            <p className="text-xs font-mono text-[#ff4444]">{matchError}</p>
          ) : (
            <p className="text-xs font-mono text-[#3ae8ff]">
              Match #{parsedMatchId} • {match?.players.length ?? '?'} human • {botCount} bots
            </p>
          )}
        </div>
      )}

      {canStartGame ? (
        <>
          <GameCanvas
            onKillFeedUpdate={setKillFeed}
            onAliveCountUpdate={setAliveCount}
            onPhaseChange={setPhase}
            onPlayerUpdate={setPlayer}
            onStormUpdate={setStorm}
            onStormCommitRequested={handleStormCommitRequested}
            onContainerPromptUpdate={setContainerPrompt}
            onContainerVerificationRequested={handleContainerVerificationRequested}
            gameStateRef={gameStateRef}
            botCount={botCount}
            mode={gameMode}
            gameId={isMatchMode ? parsedMatchId : 0}
            verifiedContainers={isMatchMode}
            verifiedStorms={isMatchMode}
          />

          <GameHUD
            player={player}
            aliveCount={aliveCount}
            storm={storm}
            gameTime={gameTime}
            containerPrompt={containerPrompt}
            touchControls={touchControls}
            onSelectSlot={touchControls ? handleSelectSlot : undefined}
          />

          <MobileControls
            visible={touchControls}
            player={player}
            containerPrompt={containerPrompt}
            gameStateRef={gameStateRef}
          />

          <KillFeed entries={killFeed} gameTime={gameTime} touchControls={touchControls} />
          <EventFeed events={somniaEvents} isLive={isLiveMode} touchControls={touchControls} />

          <VictoryScreen
            phase={phase}
            player={player}
            placement={placement}
            gameTime={gameTime}
            mode={gameMode}
            onPlayAgain={handlePlayAgain}
            onBackToMenu={handleBackToMenu}
            isMatchMode={isMatchMode}
            resultSubmitting={resultSubmitting}
            resultTxHash={resultTxHash}
            resultError={resultError}
          />
        </>
      ) : (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[rgba(0,0,0,0.78)]">
          <div className="rounded-xl border border-[rgba(255,215,0,0.3)] bg-[rgba(20,20,20,0.92)] px-6 py-5 text-center font-mono">
            <div className="text-xs uppercase text-[#ffd166]">Verified Match</div>
            <div className="mt-2 text-sm text-white">Connect your wallet to enter this match.</div>
            <div className="mt-1 text-[11px] text-[rgba(255,255,255,0.65)]">
              Match mode enforces on-chain container verification.
            </div>
          </div>
        </div>
      )}

      <div
        className={`absolute z-20 flex max-w-[calc(100vw-24px)] flex-wrap items-center gap-2 ${touchControls ? 'left-3' : 'justify-end'}`}
        style={touchControls
          ? { top: utilityBarTop, maxWidth: 'calc(100vw - 132px)' }
          : { top: utilityBarTop, right: 'calc(12px + 160px + 16px)' }}
      >
        {showWalletControl && (
            <WalletConnect
              onConnect={handleWalletConnect}
              onDisconnect={handleWalletDisconnect}
              isConnected={isWalletConnected}
              address={walletAddress}
            />
        )}
        <button
          onClick={toggleMute}
          className="pointer-events-auto rounded-lg bg-[rgba(0,0,0,0.6)] p-2 text-[rgba(255,255,255,0.6)] hover:bg-[rgba(0,0,0,0.8)] transition-colors backdrop-blur-sm"
          aria-label={muted ? 'Unmute' : 'Mute'}
        >
          {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </button>
      </div>

      {containerTxToast && (
        <div
          className={`pointer-events-none absolute z-20 ${touchControls ? 'left-3 right-3' : 'right-3'}`}
          style={{ top: touchControls ? 'calc(env(safe-area-inset-top) + 6.5rem)' : '3.5rem' }}
        >
          <div
            className="rounded-lg border px-3 py-2 font-mono text-[11px] backdrop-blur-sm"
            style={{
              backgroundColor: containerTxToast.kind === 'pending'
                ? 'rgba(20, 20, 20, 0.88)'
                : containerTxToast.kind === 'success'
                  ? 'rgba(15, 40, 20, 0.9)'
                  : 'rgba(45, 15, 15, 0.9)',
              borderColor: containerTxToast.kind === 'pending'
                ? 'rgba(58,232,255,0.38)'
                : containerTxToast.kind === 'success'
                  ? 'rgba(76,255,76,0.45)'
                  : 'rgba(255,90,90,0.45)',
              color: containerTxToast.kind === 'pending'
                ? '#9fe8ff'
                : containerTxToast.kind === 'success'
                  ? '#9bff9b'
                  : '#ff9f9f',
            }}
          >
            {containerTxToast.message}
          </div>
        </div>
      )}
    </div>
  )
}

export default function GamePage() {
  return (
    <Suspense
      fallback={(
        <div className="flex h-[100dvh] w-full items-center justify-center bg-[#0a0a0a]">
          <div className="text-center">
            <div className="text-2xl font-black font-mono text-[#3ae8ff] mb-2">LOADING...</div>
            <div className="text-sm font-mono text-[rgba(255,255,255,0.4)]">Preparing match...</div>
          </div>
        </div>
      )}
    >
      <GamePageInner />
    </Suspense>
  )
}
