'use client'

import type { GamePhase } from '@/lib/game/engine'
import type { Player } from '@/lib/game/player'
import { Swords, Timer, Target } from 'lucide-react'

interface VictoryScreenProps {
  phase: GamePhase
  player: Player | null
  placement: number
  gameTime: number
  onPlayAgain: () => void
  onBackToMenu: () => void
}

export default function VictoryScreen({
  phase, player, placement, gameTime, onPlayAgain, onBackToMenu,
}: VictoryScreenProps) {
  if (phase !== 'victory' && phase !== 'eliminated') return null
  const isVictory = phase === 'victory'

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.8)] backdrop-blur-sm">
      <div className="flex flex-col items-center gap-6">
        {/* Title */}
        <div className="text-center">
          {isVictory ? (
            <>
              <h1
                className="text-6xl font-black tracking-wider text-transparent bg-clip-text"
                style={{
                  backgroundImage: 'linear-gradient(to bottom, #ffd700, #ff8c00)',
                  WebkitBackgroundClip: 'text',
                }}
              >
                VICTORY ROYALE
              </h1>
              <p className="mt-2 text-lg font-mono text-[#ffd700]">#1</p>
            </>
          ) : (
            <>
              <h1 className="text-5xl font-black tracking-wider text-[#ff4444]">
                ELIMINATED
              </h1>
              <p className="mt-2 text-lg font-mono text-[rgba(255,255,255,0.6)]">
                #{placement}
              </p>
            </>
          )}
        </div>

        {/* Stats */}
        {player && (
          <div className="flex gap-6">
            <div className="flex flex-col items-center gap-1 rounded-xl bg-[rgba(255,255,255,0.08)] px-6 py-4">
              <Swords className="h-5 w-5 text-[#ff4444]" />
              <span className="text-2xl font-mono font-bold text-white">{player.kills}</span>
              <span className="text-xs font-mono text-[rgba(255,255,255,0.5)]">Eliminations</span>
            </div>
            <div className="flex flex-col items-center gap-1 rounded-xl bg-[rgba(255,255,255,0.08)] px-6 py-4">
              <Timer className="h-5 w-5 text-[#4ca6ff]" />
              <span className="text-2xl font-mono font-bold text-white">{formatTime(gameTime)}</span>
              <span className="text-xs font-mono text-[rgba(255,255,255,0.5)]">Survived</span>
            </div>
            <div className="flex flex-col items-center gap-1 rounded-xl bg-[rgba(255,255,255,0.08)] px-6 py-4">
              <Target className="h-5 w-5 text-[#4cff4c]" />
              <span className="text-2xl font-mono font-bold text-white">{player.damageDealt}</span>
              <span className="text-xs font-mono text-[rgba(255,255,255,0.5)]">Damage</span>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-4 mt-4 pointer-events-auto">
          <button
            onClick={onPlayAgain}
            className="rounded-xl px-8 py-3 font-mono font-bold text-sm transition-all hover:scale-105"
            style={{
              backgroundColor: isVictory ? '#ffd700' : '#3ae8ff',
              color: '#000',
            }}
          >
            PLAY AGAIN
          </button>
          <button
            onClick={onBackToMenu}
            className="rounded-xl bg-[rgba(255,255,255,0.1)] px-8 py-3 font-mono font-bold text-sm text-white transition-all hover:bg-[rgba(255,255,255,0.2)] border border-[rgba(255,255,255,0.15)]"
          >
            BACK TO MENU
          </button>
        </div>
      </div>
    </div>
  )
}
