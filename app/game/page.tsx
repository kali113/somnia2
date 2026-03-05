'use client'

import { Suspense, useState, useRef, useCallback, useEffect, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { useSearchParams, useRouter } from 'next/navigation'
import {
  confirmVerifiedContainerOpen,
  rejectVerifiedContainerOpen,
  type GameState, type GamePhase, type KillFeedEntry, type ContainerPromptState, type ContainerVerificationRequest,
} from '@/lib/game/engine'
import type { Player } from '@/lib/game/player'
import type { GameMode } from '@/lib/game/constants'
import type { StormState } from '@/lib/game/storm'
import { createConnectionEvent, type SomniaEvent } from '@/lib/somnia/events'
import { createReactivityConnection } from '@/lib/somnia/reactivity'
import { fetchMatchById, type MatchRecord } from '@/lib/somnia/matchmaking-client'
import { isBackendConfigured, backendConfigError } from '@/lib/somnia/runtime-config'
import { openContainerVerifiedOnChain } from '@/lib/somnia/chest-log'
import GameHUD from '@/components/game/GameHUD'
import KillFeed from '@/components/game/KillFeed'
import VictoryScreen from '@/components/game/VictoryScreen'
import EventFeed from '@/components/game/EventFeed'
import WalletConnect from '@/components/game/WalletConnect'
import { Volume2, VolumeX } from 'lucide-react'
import { setMuted, isMuted } from '@/lib/game/audio'

const GameCanvas = dynamic(() => import('@/components/game/GameCanvas'), {
  ssr: false,
  loading: () => (
    <div className="flex h-screen w-screen items-center justify-center bg-[#0a0a0a]">
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
  const searchParams = useSearchParams()
  const router = useRouter()
  const gameStateRef = useRef<GameState | null>(null)
  const reactivityRef = useRef<ReturnType<typeof createReactivityConnection> | null>(null)

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
  const [walletConnected, setWalletConnected] = useState(false)
  const [walletAddress, setWalletAddress] = useState<string | null>(null)
  const [isLiveMode, setIsLiveMode] = useState(false)
  const [containerTxToast, setContainerTxToast] = useState<ContainerTxToast | null>(null)

  // Audio
  const [muted, setMutedState] = useState(() => isMuted())

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
        if (cancelled) return
        setMatch(nextMatch)
        setMatchError(null)
      } catch (error) {
        if (cancelled) return
        const message = error instanceof Error ? error.message : String(error)
        setMatchError(message)
      }
    }

    loadMatch().catch(() => undefined)

    return () => {
      cancelled = true
    }
  }, [isMatchMode, parsedMatchId])

  // Game time ticker
  useEffect(() => {
    const interval = setInterval(() => {
      const state = gameStateRef.current
      if (!state) return

      setPlacement((prev) => (prev === state.placement ? prev : state.placement))
      if (state.phase === 'playing') {
        setGameTime(state.time)
      }
    }, 500)
    return () => clearInterval(interval)
  }, [])

  // Somnia event handler
  const handleSomniaEvent = useCallback((event: SomniaEvent) => {
    setSomniaEvents(prev => [event, ...prev].slice(0, 20))
  }, [])

  // Wallet handlers
  const handleWalletConnect = useCallback((address: string) => {
    setWalletConnected(true)
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
    setWalletConnected(false)
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
    if (!walletConnected || !walletAddress) {
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
      if (!gameStateRef.current) return

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
  }, [pushSystemEvent, walletConnected, walletAddress])

  useEffect(() => {
    if (!containerTxToast || containerTxToast.kind === 'pending') return
    const timer = setTimeout(() => setContainerTxToast(null), 4200)
    return () => clearTimeout(timer)
  }, [containerTxToast])

  useEffect(() => {
    return () => {
      reactivityRef.current?.disconnect()
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
  }, [muted])

  const canStartGame = !isMatchMode || walletConnected

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#0a0a0a]">
      {isMatchMode && (
        <div className="absolute left-1/2 top-3 z-20 -translate-x-1/2 rounded-lg bg-[rgba(0,0,0,0.7)] px-4 py-2 text-center backdrop-blur-sm border border-[rgba(58,232,255,0.2)]">
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
            onContainerPromptUpdate={setContainerPrompt}
            onContainerVerificationRequested={handleContainerVerificationRequested}
            gameStateRef={gameStateRef}
            botCount={botCount}
            mode={gameMode}
            gameId={isMatchMode ? parsedMatchId : 0}
            verifiedContainers={isMatchMode}
          />

          <GameHUD
            player={player}
            aliveCount={aliveCount}
            storm={storm}
            gameTime={gameTime}
            containerPrompt={containerPrompt}
          />

          <KillFeed entries={killFeed} gameTime={gameTime} />
          <EventFeed events={somniaEvents} isLive={isLiveMode} />

          <VictoryScreen
            phase={phase}
            player={player}
            placement={placement}
            gameTime={gameTime}
            mode={gameMode}
            onPlayAgain={handlePlayAgain}
            onBackToMenu={handleBackToMenu}
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

      <div className="absolute right-3 top-3 z-20 flex items-center gap-2">
        <WalletConnect
          onConnect={handleWalletConnect}
          onDisconnect={handleWalletDisconnect}
          isConnected={walletConnected}
          address={walletAddress}
        />
        <button
          onClick={toggleMute}
          className="pointer-events-auto rounded-lg bg-[rgba(0,0,0,0.6)] p-2 text-[rgba(255,255,255,0.6)] hover:bg-[rgba(0,0,0,0.8)] transition-colors backdrop-blur-sm"
          aria-label={muted ? 'Unmute' : 'Mute'}
        >
          {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </button>
      </div>

      {containerTxToast && (
        <div className="pointer-events-none absolute right-3 top-14 z-20">
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
        <div className="flex h-screen w-screen items-center justify-center bg-[#0a0a0a]">
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
