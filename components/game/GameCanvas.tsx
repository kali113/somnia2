'use client'

import { useRef, useEffect, useCallback } from 'react'
import {
  initGame, updateGame, renderGame, resizeGame, cleanupGame,
  renderGameToText,
  type GameState, type GamePhase, type KillFeedEntry, type SupplyDrop,
  type ContainerPromptState, type ContainerVerificationRequest, type ContainerRewardBundle,
} from '@/lib/game/engine'
import type { Player } from '@/lib/game/player'
import type { StormState } from '@/lib/game/storm'
import type { GameMode } from '@/lib/game/constants'
import { fetchSomniaRandomSeed } from '@/lib/somnia/random'
import { activateAudio } from '@/lib/game/audio'

type GameHookWindow = Window & {
  render_game_to_text?: () => string
  advanceTime?: (ms: number) => Promise<void>
}

interface GameCanvasProps {
  onKillFeedUpdate: (feed: KillFeedEntry[]) => void
  onAliveCountUpdate: (count: number) => void
  onPhaseChange: (phase: GamePhase) => void
  onPlayerUpdate: (player: Player) => void
  onStormUpdate: (storm: StormState) => void
  onSupplyDrop?: (drop: SupplyDrop) => void
  onContainerPromptUpdate?: (prompt: ContainerPromptState | null) => void
  onContainerVerificationRequested?: (request: ContainerVerificationRequest) => void
  onContainerOpened?: (result: ContainerRewardBundle) => void
  gameStateRef: React.MutableRefObject<GameState | null>
  botCount?: number
  mode?: GameMode
  gameId?: number
  verifiedContainers?: boolean
}

export default function GameCanvas({
  onKillFeedUpdate,
  onAliveCountUpdate,
  onPhaseChange,
  onPlayerUpdate,
  onStormUpdate,
  onSupplyDrop,
  onContainerPromptUpdate,
  onContainerVerificationRequested,
  onContainerOpened,
  gameStateRef,
  botCount,
  mode,
  gameId,
  verifiedContainers,
}: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animFrameRef = useRef<number>(0)
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null)
  const lastTimeRef = useRef(-1)
  const manualAdvanceRef = useRef(false)

  const handleResize = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight
    if (gameStateRef.current) {
      resizeGame(gameStateRef.current, canvas.width, canvas.height)
    }
  }, [gameStateRef])

  const stepGame = useCallback((dt: number) => {
    const state = gameStateRef.current
    const ctx = ctxRef.current
    if (!state || !ctx) return

    updateGame(state, dt)
    renderGame(ctx, state)
  }, [gameStateRef])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let cancelled = false
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctxRef.current = ctx

    const win = window as GameHookWindow
    win.render_game_to_text = () => {
      const state = gameStateRef.current
      return state ? renderGameToText(state) : JSON.stringify({ phase: 'loading' })
    }
    win.advanceTime = async (ms: number) => {
      if (!gameStateRef.current) return

      manualAdvanceRef.current = true
      try {
        const steps = Math.max(1, Math.round(ms / (1000 / 60)))
        for (let i = 0; i < steps; i++) {
          stepGame(1 / 60)
        }
      } finally {
        manualAdvanceRef.current = false
        lastTimeRef.current = -1
      }
    }

    const handleUserActivation = () => {
      void activateAudio()
    }
    window.addEventListener('pointerdown', handleUserActivation, { passive: true })
    window.addEventListener('keydown', handleUserActivation)

    const boot = async () => {
      const mapSeed = await fetchSomniaRandomSeed()
      if (cancelled) return

      const state = initGame(canvas, {
        botCount,
        mapSeed,
        mode,
        gameId,
        verifiedContainers,
      })
      gameStateRef.current = state

      // Wire up callbacks
      state.onKillFeedUpdate = onKillFeedUpdate
      state.onAliveCountUpdate = onAliveCountUpdate
      state.onPhaseChange = onPhaseChange
      state.onPlayerUpdate = onPlayerUpdate
      state.onStormUpdate = onStormUpdate
      state.onSupplyDrop = onSupplyDrop
      state.onContainerPromptUpdate = onContainerPromptUpdate
      state.onContainerVerificationRequested = onContainerVerificationRequested
      state.onContainerOpened = onContainerOpened

      const loop = (timestamp: number) => {
        if (manualAdvanceRef.current) {
          lastTimeRef.current = timestamp
          animFrameRef.current = requestAnimationFrame(loop)
          return
        }

        if (lastTimeRef.current < 0) lastTimeRef.current = timestamp
        const dt = Math.min((timestamp - lastTimeRef.current) / 1000, 0.05) // Cap at 50ms
        lastTimeRef.current = timestamp

        stepGame(dt)

        animFrameRef.current = requestAnimationFrame(loop)
      }

      animFrameRef.current = requestAnimationFrame(loop)
      renderGame(ctx, state)

      // Initial state push
      onPlayerUpdate(state.player)
      onAliveCountUpdate(state.aliveCount)
      onPhaseChange(state.phase)
    }

    boot().catch((error) => {
      console.error('Failed to boot game canvas', error)
    })

    window.addEventListener('resize', handleResize)

    return () => {
      cancelled = true
      manualAdvanceRef.current = false
      lastTimeRef.current = -1
      cancelAnimationFrame(animFrameRef.current)
      window.removeEventListener('pointerdown', handleUserActivation)
      window.removeEventListener('keydown', handleUserActivation)
      window.removeEventListener('resize', handleResize)
      win.render_game_to_text = undefined
      win.advanceTime = undefined
      cleanupGame(canvas)
      ctxRef.current = null
      gameStateRef.current = null
    }
  }, [
    handleResize, stepGame, onKillFeedUpdate, onAliveCountUpdate,
    onPhaseChange, onPlayerUpdate, onStormUpdate, onSupplyDrop,
    onContainerPromptUpdate, onContainerVerificationRequested, onContainerOpened,
    gameStateRef, botCount, mode, gameId, verifiedContainers,
  ])

  return (
    <canvas
      ref={canvasRef}
      className="block w-full h-full"
      style={{ cursor: 'none', imageRendering: 'pixelated' }}
    />
  )
}
