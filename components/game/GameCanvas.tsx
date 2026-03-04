'use client'

import { useRef, useEffect, useCallback } from 'react'
import {
  initGame, updateGame, renderGame, resizeGame, cleanupGame,
  addSupplyDrop, type GameState, type GamePhase, type KillFeedEntry, type SupplyDrop,
} from '@/lib/game/engine'
import type { Player } from '@/lib/game/player'
import type { StormState } from '@/lib/game/storm'
import type { Rarity } from '@/lib/game/constants'

interface GameCanvasProps {
  onKillFeedUpdate: (feed: KillFeedEntry[]) => void
  onAliveCountUpdate: (count: number) => void
  onPhaseChange: (phase: GamePhase) => void
  onPlayerUpdate: (player: Player) => void
  onStormUpdate: (storm: StormState) => void
  onSupplyDrop: (drop: SupplyDrop) => void
  gameStateRef: React.MutableRefObject<GameState | null>
}

export default function GameCanvas({
  onKillFeedUpdate,
  onAliveCountUpdate,
  onPhaseChange,
  onPlayerUpdate,
  onStormUpdate,
  onSupplyDrop,
  gameStateRef,
}: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animFrameRef = useRef<number>(0)

  const handleResize = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight
    if (gameStateRef.current) {
      resizeGame(gameStateRef.current, canvas.width, canvas.height)
    }
  }, [gameStateRef])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    canvas.width = window.innerWidth
    canvas.height = window.innerHeight

    const state = initGame(canvas)
    gameStateRef.current = state

    // Wire up callbacks
    state.onKillFeedUpdate = onKillFeedUpdate
    state.onAliveCountUpdate = onAliveCountUpdate
    state.onPhaseChange = onPhaseChange
    state.onPlayerUpdate = onPlayerUpdate
    state.onStormUpdate = onStormUpdate
    state.onSupplyDrop = onSupplyDrop

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let lastTime = -1

    const loop = (timestamp: number) => {
      if (lastTime < 0) lastTime = timestamp
      const dt = Math.min((timestamp - lastTime) / 1000, 0.05) // Cap at 50ms
      lastTime = timestamp

      updateGame(state, dt)
      renderGame(ctx, state)

      animFrameRef.current = requestAnimationFrame(loop)
    }

    animFrameRef.current = requestAnimationFrame(loop)

    window.addEventListener('resize', handleResize)

    // Initial state push
    onPlayerUpdate(state.player)
    onAliveCountUpdate(state.aliveCount)
    onPhaseChange(state.phase)

    return () => {
      cancelAnimationFrame(animFrameRef.current)
      window.removeEventListener('resize', handleResize)
      cleanupGame(canvas)
      gameStateRef.current = null
    }
  }, [
    handleResize, onKillFeedUpdate, onAliveCountUpdate,
    onPhaseChange, onPlayerUpdate, onStormUpdate, onSupplyDrop, gameStateRef,
  ])

  return (
    <canvas
      ref={canvasRef}
      className="block w-full h-full"
      style={{ cursor: 'none', imageRendering: 'pixelated' }}
    />
  )
}
