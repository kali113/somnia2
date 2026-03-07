'use client'

import { useRef, useEffect, useCallback } from 'react'
import {
  initGame, updateGame, renderGame, resizeGame, cleanupGame,
  renderGameToText,
  type GameState, type GamePhase, type KillFeedEntry, type SupplyDrop,
  type ContainerPromptState, type ContainerVerificationRequest, type ContainerRewardBundle, type StormCommitRequest,
} from '@/lib/game/engine'
import type { Player } from '@/lib/game/player'
import { isInStorm, type StormState } from '@/lib/game/storm'
import type { GameMode } from '@/lib/game/constants'
import { fetchSomniaRandomSeed } from '@/lib/somnia/random'
import { activateAudio } from '@/lib/game/audio'

type GameHookWindow = Window & {
  render_game_to_text?: () => string
  advanceTime?: (ms: number) => void
  pixel_debug_state?: GameState | null
  pixel_debug_snapshot?: () => {
    time: number
    aliveCount: number
    storm: {
      shrinking: boolean
      currentRadius: number
      targetRadius: number
    }
    botsInStorm: number
    botsOutsideTargetZone: number
    stormBotSample: Array<{ name: string; x: number; y: number }>
  }
}

interface GameCanvasProps {
  onKillFeedUpdate: (feed: KillFeedEntry[]) => void
  onAliveCountUpdate: (count: number) => void
  onPhaseChange: (phase: GamePhase) => void
  onPlayerUpdate: (player: Player) => void
  onStormUpdate: (storm: StormState) => void
  onStormCommitRequested?: (request: StormCommitRequest) => void
  onSupplyDrop?: (drop: SupplyDrop) => void
  onContainerPromptUpdate?: (prompt: ContainerPromptState | null) => void
  onContainerVerificationRequested?: (request: ContainerVerificationRequest) => void
  onContainerOpened?: (result: ContainerRewardBundle) => void
  gameStateRef: React.MutableRefObject<GameState | null>
  botCount?: number
  mode?: GameMode
  gameId?: number
  verifiedContainers?: boolean
  verifiedStorms?: boolean
}

export default function GameCanvas({
  onKillFeedUpdate,
  onAliveCountUpdate,
  onPhaseChange,
  onPlayerUpdate,
  onStormUpdate,
  onStormCommitRequested,
  onSupplyDrop,
  onContainerPromptUpdate,
  onContainerVerificationRequested,
  onContainerOpened,
  gameStateRef,
  botCount,
  mode,
  gameId,
  verifiedContainers,
  verifiedStorms,
}: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animFrameRef = useRef<number>(0)
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null)
  const lastTimeRef = useRef(-1)
  const manualAdvanceRef = useRef(false)

  const handleResize = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) {return}
    const viewport = window.visualViewport
    const width = Math.max(1, Math.round(viewport?.width ?? window.innerWidth))
    const height = Math.max(1, Math.round(viewport?.height ?? window.innerHeight))
    canvas.width = width
    canvas.height = height
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    if (gameStateRef.current) {
      resizeGame(gameStateRef.current, width, height)
    }
  }, [gameStateRef])

  const stepGame = useCallback((dt: number) => {
    const state = gameStateRef.current
    const ctx = ctxRef.current
    if (!state || !ctx) {return}

    updateGame(state, dt)
    renderGame(ctx, state)
  }, [gameStateRef])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) {return}

    let cancelled = false
    canvas.style.touchAction = 'none'
    handleResize()
    const ctx = canvas.getContext('2d')
    if (!ctx) {return}
    ctxRef.current = ctx

    const win = window as GameHookWindow
    win.render_game_to_text = () => {
      const state = gameStateRef.current
      return state ? renderGameToText(state) : JSON.stringify({ phase: 'loading' })
    }
    if (process.env.NODE_ENV !== 'production') {
      win.pixel_debug_state = gameStateRef.current
      win.pixel_debug_snapshot = () => {
        const state = gameStateRef.current
        if (!state) {
          return {
            time: 0,
            aliveCount: 0,
            storm: { shrinking: false, currentRadius: 0, targetRadius: 0 },
            botsInStorm: 0,
            botsOutsideTargetZone: 0,
            stormBotSample: [],
          }
        }

        const aliveBots = state.bots.filter((bot) => bot.alive)
        const botsInStorm = aliveBots.filter((bot) => isInStorm(state.storm, bot.x, bot.y))
        const botsOutsideTargetZone = state.storm.shrinking
          ? aliveBots.filter((bot) => {
              const dx = bot.x - state.storm.targetCenterX
              const dy = bot.y - state.storm.targetCenterY
              return dx * dx + dy * dy > state.storm.targetRadius * state.storm.targetRadius
            }).length
          : 0

        return {
          time: state.time,
          aliveCount: state.aliveCount,
          storm: {
            shrinking: state.storm.shrinking,
            currentRadius: state.storm.currentRadius,
            targetRadius: state.storm.targetRadius,
          },
          botsInStorm: botsInStorm.length,
          botsOutsideTargetZone,
          stormBotSample: botsInStorm.slice(0, 6).map((bot) => ({
            name: bot.name,
            x: Math.round(bot.x),
            y: Math.round(bot.y),
          })),
        }
      }
    }
    win.advanceTime = (ms: number) => {
      if (!gameStateRef.current) {return}

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
      if (cancelled) {return}

      const state = initGame(canvas, {
        botCount,
        mapSeed,
        mode,
        gameId,
        verifiedContainers,
        verifiedStorms,
      })
      gameStateRef.current = state
      if (process.env.NODE_ENV !== 'production') {
        win.pixel_debug_state = state
      }

      // Wire up callbacks
      state.onKillFeedUpdate = onKillFeedUpdate
      state.onAliveCountUpdate = onAliveCountUpdate
      state.onPhaseChange = onPhaseChange
      state.onPlayerUpdate = onPlayerUpdate
      state.onStormUpdate = onStormUpdate
      state.onStormCommitRequested = onStormCommitRequested
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

        if (lastTimeRef.current < 0) {lastTimeRef.current = timestamp}
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

    boot().catch((error: unknown) => {
      console.error('Failed to boot game canvas', error)
    })

    window.addEventListener('resize', handleResize)
    window.visualViewport?.addEventListener('resize', handleResize)
    window.visualViewport?.addEventListener('scroll', handleResize)

    return () => {
      cancelled = true
      manualAdvanceRef.current = false
      lastTimeRef.current = -1
      cancelAnimationFrame(animFrameRef.current)
      window.removeEventListener('pointerdown', handleUserActivation)
      window.removeEventListener('keydown', handleUserActivation)
      window.removeEventListener('resize', handleResize)
      window.visualViewport?.removeEventListener('resize', handleResize)
      window.visualViewport?.removeEventListener('scroll', handleResize)
      win.render_game_to_text = undefined
      win.pixel_debug_state = undefined
      win.pixel_debug_snapshot = undefined
      win.advanceTime = undefined
      cleanupGame(canvas)
      ctxRef.current = null
      gameStateRef.current = null
    }
  }, [
    handleResize, stepGame, onKillFeedUpdate, onAliveCountUpdate,
    onPhaseChange, onPlayerUpdate, onStormUpdate, onStormCommitRequested, onSupplyDrop,
    onContainerPromptUpdate, onContainerVerificationRequested, onContainerOpened,
    gameStateRef, botCount, mode, gameId, verifiedContainers, verifiedStorms,
  ])

  return (
    <canvas
      ref={canvasRef}
      className="game-touch-surface block h-full w-full"
      style={{ cursor: 'none', imageRendering: 'pixelated' }}
    />
  )
}
