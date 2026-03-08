'use client'

import type { KillFeedEntry } from '@/lib/game/engine'
import type { SomniaEvent } from '@/lib/somnia/events'
import type { PlayerEliminatedEventData } from '@/lib/somnia/events'

interface KillFeedProps {
  entries: KillFeedEntry[]
  gameTime: number
  touchControls?: boolean
  onChainEvents?: SomniaEvent[]
}

function formatGameTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

interface MergedEntry {
  killer: string
  victim: string
  time: number
  isPlayer: boolean
  confirmed: boolean
  txHash?: string
}

export default function KillFeed({ entries, gameTime, touchControls = false, onChainEvents = [] }: KillFeedProps) {
  if (touchControls) {return null}

  // Build merged list: local entries + on-chain confirmed entries
  const onChainKills = onChainEvents
    .filter((e): e is SomniaEvent & { data: PlayerEliminatedEventData } => e.type === 'player_eliminated')

  // Create a set of on-chain kill keys for dedup
  const confirmedKeys = new Set(
    onChainKills.map((e) => `${e.data.killer}-${e.data.player}`),
  )

  const merged: MergedEntry[] = []

  // Add local entries, marking confirmed ones
  for (const entry of entries) {
    const key = `${entry.killer}-${entry.victim}`
    merged.push({
      killer: entry.killer,
      victim: entry.victim,
      time: entry.time,
      isPlayer: entry.killer === 'You' || entry.victim === 'You',
      confirmed: confirmedKeys.has(key),
      txHash: onChainKills.find((e) => `${e.data.killer}-${e.data.player}` === key)?.txHash ?? undefined,
    })
  }

  // Add on-chain kills not already in local entries
  for (const event of onChainKills) {
    const localKey = `${event.data.killer}-${event.data.player}`
    const alreadyLocal = entries.some((e) => `${e.killer}-${e.victim}` === localKey)
    if (!alreadyLocal) {
      merged.push({
        killer: event.data.killer,
        victim: event.data.player,
        time: event.data.eliminatedAt,
        isPlayer: false,
        confirmed: true,
        txHash: event.txHash ?? undefined,
      })
    }
  }

  const visible = merged.filter((entry) => {
    const age = gameTime - entry.time
    return age < 8 && age >= 0
  })

  if (visible.length === 0) {return null}

  return (
    <div className="absolute right-3 top-[184px] z-10 flex flex-col gap-1 pointer-events-none">
      {visible.slice(0, 6).map((entry) => {
        const age = gameTime - entry.time
        const opacity = Math.max(0, 1 - age / 8)

        return (
          <div
            key={`${entry.killer}-${entry.victim}-${entry.time}`}
            className="flex items-center gap-2 rounded px-3 py-1 text-xs font-mono backdrop-blur-sm transition-opacity"
            style={{
              opacity,
              backgroundColor: entry.isPlayer ? 'rgba(58, 232, 255, 0.15)' : 'rgba(0, 0, 0, 0.65)',
              border: entry.isPlayer ? '1px solid rgba(58, 232, 255, 0.3)' : '1px solid rgba(255,255,255,0.1)',
            }}
          >
            <span className="text-[rgba(255,255,255,0.35)]">
              [{formatGameTime(entry.time)}]
            </span>
            <span className={entry.isPlayer && entry.killer === 'You' ? 'text-[#3ae8ff]' : 'text-white'}>
              {entry.killer}
            </span>
            <span className="text-[rgba(255,255,255,0.4)]">
              eliminated
            </span>
            <span className={entry.isPlayer && entry.victim === 'You' ? 'text-[#3ae8ff]' : 'text-[#ff4444]'}>
              {entry.victim}
            </span>
            {entry.confirmed && (
              <span className="text-[#4cff4c]" title={entry.txHash ? `tx: ${entry.txHash}` : 'On-chain confirmed'}>
                &#x26d3;
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
