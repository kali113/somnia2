'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import dynamic from 'next/dynamic'
import type { GameState, GamePhase, KillFeedEntry, SupplyDrop } from '@/lib/game/engine'
import { addSupplyDrop } from '@/lib/game/engine'
import type { Player } from '@/lib/game/player'
import type { StormState } from '@/lib/game/storm'
import type { Rarity } from '@/lib/game/constants'
import type { SomniaEvent, SupplyDropEventData } from '@/lib/somnia/events'
import { createDemoEventEmitter } from '@/lib/somnia/demo-events'
import { createReactivityConnection } from '@/lib/somnia/reactivity'
import GameHUD from '@/components/game/GameHUD'
import KillFeed from '@/components/game/KillFeed'
import VictoryScreen from '@/components/game/VictoryScreen'
import EventFeed from '@/components/game/EventFeed'
import WalletConnect from '@/components/game/WalletConnect'
import { Volume2, VolumeX } from 'lucide-react'
import { setMuted, isMuted } from '@/lib/game/audio'

// Dynamic import for GameCanvas to avoid SSR issues with canvas
const GameCanvas = dynamic(() => import('@/components/game/GameCanvas'), {
  ssr: false,
  loading: () => (
    <div className="flex h-screen w-screen items-center justify-center bg-[#0a0a0a]">
      <div className="text-center">
        <div className="text-2xl font-black font-mono text-[#3ae8ff] mb-2">LOADING...</div>
        <div className="text-sm font-mono text-[rgba(255,255,255,0.4)]">Generating map...</div>
      </div>
    </div>
  ),
})

export default function GamePage() {
  const gameStateRef = useRef<GameState | null>(null)
  const demoEmitterRef = useRef<ReturnType<typeof createDemoEventEmitter> | null>(null)
  const reactivityRef = useRef<ReturnType<typeof createReactivityConnection> | null>(null)

  // UI state
  const [player, setPlayer] = useState<Player | null>(null)
  const [aliveCount, setAliveCount] = useState(25)
  const [phase, setPhase] = useState<GamePhase>('playing')
  const [storm, setStorm] = useState<StormState | null>(null)
  const [killFeed, setKillFeed] = useState<KillFeedEntry[]>([])
  const [gameTime, setGameTime] = useState(0)

  // Somnia state
  const [somniaEvents, setSomniaEvents] = useState<SomniaEvent[]>([])
  const [walletConnected, setWalletConnected] = useState(false)
  const [walletAddress, setWalletAddress] = useState<string | null>(null)
  const [isLiveMode, setIsLiveMode] = useState(false)

  // Audio
  const [muted, setMutedState] = useState(false)

  // Game time ticker
  useEffect(() => {
    const interval = setInterval(() => {
      if (gameStateRef.current && gameStateRef.current.phase === 'playing') {
        setGameTime(gameStateRef.current.time)
      }
    }, 500)
    return () => clearInterval(interval)
  }, [])

  // ── Somnia event handler ────────────────────────────────────────────────
  const handleSomniaEvent = useCallback((event: SomniaEvent) => {
    setSomniaEvents(prev => [event, ...prev].slice(0, 20))

    // React to events in-game
    if (gameStateRef.current && gameStateRef.current.phase === 'playing') {
      if (event.type === 'supply_drop') {
        const data = event.data as SupplyDropEventData
        addSupplyDrop(gameStateRef.current, data.x, data.y, data.rarity)
      }
    }
  }, [])

  // ── Start demo events ────────────────────────────────────────────────
  useEffect(() => {
    if (!isLiveMode) {
      const emitter = createDemoEventEmitter(handleSomniaEvent)
      demoEmitterRef.current = emitter
      emitter.start()
      return () => {
        emitter.stop()
        demoEmitterRef.current = null
      }
    }
  }, [isLiveMode, handleSomniaEvent])

  // ── Wallet handlers ──────────────────────────────────────────────────
  const handleWalletConnect = useCallback((address: string) => {
    setWalletConnected(true)
    setWalletAddress(address)
    setIsLiveMode(true)

    // Stop demo events
    demoEmitterRef.current?.stop()

    // Start live reactivity
    const conn = createReactivityConnection(handleSomniaEvent)
    reactivityRef.current = conn
    conn.connect()
  }, [handleSomniaEvent])

  const handleWalletDisconnect = useCallback(() => {
    setWalletConnected(false)
    setWalletAddress(null)
    setIsLiveMode(false)

    // Stop live reactivity
    reactivityRef.current?.disconnect()
    reactivityRef.current = null

    // Restart demo events
    const emitter = createDemoEventEmitter(handleSomniaEvent)
    demoEmitterRef.current = emitter
    emitter.start()
  }, [handleSomniaEvent])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      demoEmitterRef.current?.stop()
      reactivityRef.current?.disconnect()
    }
  }, [])

  // ── Game callbacks ───────────────────────────────────────────────────
  const handlePlayAgain = useCallback(() => {
    window.location.reload()
  }, [])

  const handleBackToMenu = useCallback(() => {
    window.location.href = '/play'
  }, [])

  const toggleMute = useCallback(() => {
    const newMuted = !muted
    setMutedState(newMuted)
    setMuted(newMuted)
  }, [muted])

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#0a0a0a]">
      {/* Game Canvas */}
      <GameCanvas
        onKillFeedUpdate={setKillFeed}
        onAliveCountUpdate={setAliveCount}
        onPhaseChange={setPhase}
        onPlayerUpdate={setPlayer}
        onStormUpdate={setStorm}
        onSupplyDrop={() => {}}
        gameStateRef={gameStateRef}
      />

      {/* HUD Overlay */}
      <GameHUD
        player={player}
        aliveCount={aliveCount}
        storm={storm}
        gameTime={gameTime}
      />

      {/* Kill Feed */}
      <KillFeed entries={killFeed} gameTime={gameTime} />

      {/* Somnia Event Feed */}
      <EventFeed events={somniaEvents} isLive={isLiveMode} />

      {/* Victory/Elimination Screen */}
      <VictoryScreen
        phase={phase}
        player={player}
        placement={gameStateRef.current?.placement ?? 0}
        gameTime={gameTime}
        onPlayAgain={handlePlayAgain}
        onBackToMenu={handleBackToMenu}
      />

      {/* Top-right controls */}
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
    </div>
  )
}
