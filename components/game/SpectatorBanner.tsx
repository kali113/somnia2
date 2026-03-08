'use client'

import type { GamePhase } from '@/lib/game/engine'

interface SpectatorBannerProps {
  phase: GamePhase
  aliveCount: number
  onSkip: () => void
}

export default function SpectatorBanner({ phase, aliveCount, onSkip }: SpectatorBannerProps) {
  if (phase !== 'spectating') {return null}

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex flex-col items-center gap-3 pt-4">
      <div
        className="rounded-lg border px-6 py-2 font-mono text-sm font-bold uppercase tracking-widest backdrop-blur-sm"
        style={{
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          borderColor: 'rgba(255, 255, 255, 0.2)',
          color: 'rgba(255, 255, 255, 0.8)',
        }}
      >
        SPECTATING
      </div>
      <div className="text-xs font-mono text-[rgba(255,255,255,0.5)]">
        {aliveCount} player{aliveCount !== 1 ? 's' : ''} remaining
      </div>
      <div className="text-xs font-mono text-[rgba(255,255,255,0.35)]">
        &#x2190; / &#x2192; to switch players
      </div>
      <button
        onClick={onSkip}
        className="pointer-events-auto rounded-lg border border-[rgba(255,255,255,0.15)] bg-[rgba(0,0,0,0.6)] px-4 py-1.5 font-mono text-xs text-[rgba(255,255,255,0.6)] transition-colors hover:bg-[rgba(0,0,0,0.8)] hover:text-white backdrop-blur-sm"
      >
        Skip to Results
      </button>
    </div>
  )
}
