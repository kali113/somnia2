'use client'

import type { GamePhase } from '@/lib/game/engine'
import type { Player } from '@/lib/game/player'
import type { GameMode } from '@/lib/game/constants'
import { Swords, Timer, Target } from 'lucide-react'

interface VictoryScreenProps {
  phase: GamePhase
  player: Player | null
  placement: number
  gameTime: number
  mode?: GameMode
  onPlayAgain: () => void
  onBackToMenu: () => void
  isMatchMode?: boolean
  resultSubmitting?: boolean
  resultTxHash?: string | null
  resultError?: string | null
}

export default function VictoryScreen({
  phase, player, placement, gameTime, mode, onPlayAgain, onBackToMenu,
  isMatchMode = false, resultSubmitting = false, resultTxHash = null, resultError = null,
}: VictoryScreenProps) {
  if (phase !== 'victory' && phase !== 'eliminated') return null
  const isVictory = phase === 'victory'

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.8)] px-4 backdrop-blur-sm">
      <div className="flex w-full max-w-3xl flex-col items-center gap-6">
        {/* Title */}
        <div className="text-center">
          {isVictory ? (
            <>
              <h1
                className="bg-clip-text text-4xl font-black tracking-wider text-transparent sm:text-6xl"
                style={{
                  backgroundImage: 'linear-gradient(to bottom, #ffd700, #ff8c00)',
                  WebkitBackgroundClip: 'text',
                }}
              >
                {mode === 'duo' ? 'DUO VICTORY' : mode === 'squad' ? 'SQUAD VICTORY' : 'VICTORY ROYALE'}
              </h1>
              <p className="mt-2 text-lg font-mono text-[#ffd700]">#1</p>
            </>
          ) : (
            <>
              <h1 className="text-4xl font-black tracking-wider text-[#ff4444] sm:text-5xl">
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
          <div className="flex flex-wrap justify-center gap-4 sm:gap-6">
            <div className="flex min-w-[8.5rem] flex-col items-center gap-1 rounded-xl bg-[rgba(255,255,255,0.08)] px-5 py-4 sm:px-6">
              <Swords className="h-5 w-5 text-[#ff4444]" />
              <span className="text-2xl font-mono font-bold text-white">{player.kills}</span>
              <span className="text-xs font-mono text-[rgba(255,255,255,0.5)]">Eliminations</span>
            </div>
            <div className="flex min-w-[8.5rem] flex-col items-center gap-1 rounded-xl bg-[rgba(255,255,255,0.08)] px-5 py-4 sm:px-6">
              <Timer className="h-5 w-5 text-[#4ca6ff]" />
              <span className="text-2xl font-mono font-bold text-white">{formatTime(gameTime)}</span>
              <span className="text-xs font-mono text-[rgba(255,255,255,0.5)]">Survived</span>
            </div>
            <div className="flex min-w-[8.5rem] flex-col items-center gap-1 rounded-xl bg-[rgba(255,255,255,0.08)] px-5 py-4 sm:px-6">
              <Target className="h-5 w-5 text-[#4cff4c]" />
              <span className="text-2xl font-mono font-bold text-white">{player.damageDealt}</span>
              <span className="text-xs font-mono text-[rgba(255,255,255,0.5)]">Damage</span>
            </div>
          </div>
        )}

        {/* On-chain status */}
        {isMatchMode && resultSubmitting && (
          <div
            className="rounded-lg border px-4 py-2.5 text-center font-mono text-xs backdrop-blur-sm"
            style={{
              backgroundColor: 'rgba(58, 232, 255, 0.08)',
              borderColor: 'rgba(58, 232, 255, 0.3)',
              color: '#3ae8ff',
            }}
          >
            <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-[#3ae8ff]" />
            Recording result on-chain...
          </div>
        )}
        {isMatchMode && !resultSubmitting && resultTxHash && (
          <div
            className="rounded-lg border px-4 py-2.5 text-center font-mono text-xs backdrop-blur-sm"
            style={{
              backgroundColor: 'rgba(76, 255, 76, 0.08)',
              borderColor: 'rgba(76, 255, 76, 0.3)',
              color: '#4cff4c',
            }}
          >
            Result recorded on-chain{' '}
            <a
              href={`https://shannon-explorer.somnia.network/tx/${resultTxHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:brightness-125"
              style={{ color: '#4cff4c' }}
            >
              {resultTxHash.slice(0, 10)}...
            </a>
          </div>
        )}
        {isMatchMode && !resultSubmitting && !resultTxHash && resultError && (
          <div
            className="rounded-lg border px-4 py-2.5 text-center font-mono text-xs backdrop-blur-sm"
            style={{
              backgroundColor: 'rgba(255, 68, 68, 0.08)',
              borderColor: 'rgba(255, 68, 68, 0.3)',
              color: '#ff4444',
            }}
          >
            Failed to record result &mdash;{' '}
            <span className="text-[rgba(255,255,255,0.5)]">{resultError}</span>
          </div>
        )}

        {/* Actions */}
        <div className="mt-4 flex w-full flex-col gap-3 pointer-events-auto sm:w-auto sm:flex-row sm:gap-4">
          <button
            onClick={onPlayAgain}
            className="rounded-xl px-8 py-3 font-mono text-sm font-bold transition-all hover:scale-105"
            style={{
              backgroundColor: isVictory ? '#ffd700' : '#3ae8ff',
              color: '#000',
            }}
          >
            PLAY AGAIN
          </button>
          <button
            onClick={onBackToMenu}
            className="rounded-xl border border-[rgba(255,255,255,0.15)] bg-[rgba(255,255,255,0.1)] px-8 py-3 font-mono text-sm font-bold text-white transition-all hover:bg-[rgba(255,255,255,0.2)]"
          >
            BACK TO MENU
          </button>
        </div>
      </div>
    </div>
  )
}
