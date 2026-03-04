'use client'

import type { KillFeedEntry } from '@/lib/game/engine'

interface KillFeedProps {
  entries: KillFeedEntry[]
  gameTime: number
}

export default function KillFeed({ entries, gameTime }: KillFeedProps) {
  if (entries.length === 0) return null

  return (
    <div className="absolute right-3 top-16 z-10 flex flex-col gap-1 pointer-events-none">
      {entries.slice(0, 6).map((entry, i) => {
        const age = gameTime - entry.time
        const opacity = Math.max(0, 1 - age / 8)
        if (opacity <= 0) return null

        const isPlayer = entry.killer === 'You' || entry.victim === 'You'

        return (
          <div
            key={`${entry.killer}-${entry.victim}-${entry.time}`}
            className="flex items-center gap-2 rounded px-3 py-1 text-xs font-mono backdrop-blur-sm transition-opacity"
            style={{
              opacity,
              backgroundColor: isPlayer ? 'rgba(58, 232, 255, 0.15)' : 'rgba(0, 0, 0, 0.65)',
              border: isPlayer ? '1px solid rgba(58, 232, 255, 0.3)' : '1px solid rgba(255,255,255,0.1)',
            }}
          >
            <span className={isPlayer && entry.killer === 'You' ? 'text-[#3ae8ff]' : 'text-white'}>
              {entry.killer}
            </span>
            <span className="text-[rgba(255,255,255,0.4)]">
              [{entry.weapon}]
            </span>
            <span className={isPlayer && entry.victim === 'You' ? 'text-[#3ae8ff]' : 'text-[#ff4444]'}>
              {entry.victim}
            </span>
          </div>
        )
      })}
    </div>
  )
}
