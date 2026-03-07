'use client'

import { useEffect, useRef, useState } from 'react'
import type { SomniaEvent } from '@/lib/somnia/events'
import { formatEventMessage } from '@/lib/somnia/events'
import { Trophy, Users, Link2, AlertTriangle, Coins, KeySquare, PackageOpen, Orbit, Zap, Medal } from 'lucide-react'

interface EventFeedProps {
  events: SomniaEvent[]
  isLive: boolean
  touchControls?: boolean
}

const EVENT_ICONS: Record<string, typeof Users> = {
  queue_joined: Users,
  queue_left: Users,
  game_started: Trophy,
  game_ended: Trophy,
  reactive_force_start: Zap,
  reactive_reward_claim: Coins,
  leaderboard_updated: Medal,
  storm_committed: Orbit,
  chest_opened: PackageOpen,
  reward_claimed: Coins,
  session_approved: KeySquare,
  session_revoked: KeySquare,
  chain_connected: Link2,
  chain_error: AlertTriangle,
}

const EVENT_COLORS: Record<string, string> = {
  queue_joined: '#4cff4c',
  queue_left: '#ff8c00',
  game_started: '#3ae8ff',
  game_ended: '#ffd700',
  reactive_force_start: '#7df9ff',
  reactive_reward_claim: '#73ffa1',
  leaderboard_updated: '#ffb703',
  storm_committed: '#9f8cff',
  chest_opened: '#ffd166',
  reward_claimed: '#4cff4c',
  session_approved: '#7b2dff',
  session_revoked: '#ff4444',
  chain_connected: '#4cff4c',
  chain_error: '#ff4444',
}

export default function EventFeed({ events, isLive, touchControls = false }: EventFeedProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0
    }
  }, [events.length])

  useEffect(() => {
    const interval = setInterval(() => {
      setNowMs(Date.now())
    }, 1000)
    return () => { clearInterval(interval); }
  }, [])

  if (touchControls) {
    return (
      <div
        className="pointer-events-none absolute left-3 z-10"
        style={{ top: 'calc(env(safe-area-inset-top) + 4.75rem)' }}
      >
        <div className="flex items-center gap-1.5 rounded-lg bg-[rgba(0,0,0,0.78)] px-3 py-1.5 backdrop-blur-sm">
          <div
            className="h-2 w-2 rounded-full"
            style={{
              backgroundColor: isLive ? '#4cff4c' : '#ff4444',
              boxShadow: `0 0 6px ${isLive ? '#4cff4c' : '#ff4444'}`,
            }}
          />
          <span className="text-[10px] font-mono text-[rgba(255,255,255,0.72)]">
            SOMNIA {isLive ? 'LIVE' : 'DISCONNECTED'}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="absolute left-3 top-16 z-10 w-64 pointer-events-none">
      <div className="flex items-center gap-2 mb-1">
        <div className="flex items-center gap-1.5 rounded-t-lg bg-[rgba(0,0,0,0.8)] px-3 py-1.5 backdrop-blur-sm">
          <div
            className="h-2 w-2 rounded-full"
            style={{
              backgroundColor: isLive ? '#4cff4c' : '#ff4444',
              boxShadow: `0 0 6px ${isLive ? '#4cff4c' : '#ff4444'}`,
            }}
          />
          <span className="text-[10px] font-mono text-[rgba(255,255,255,0.7)]">
            SOMNIA {isLive ? 'LIVE' : 'DISCONNECTED'}
          </span>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex flex-col gap-0.5 max-h-48 overflow-hidden rounded-b-lg rounded-tr-lg bg-[rgba(0,0,0,0.6)] p-1.5 backdrop-blur-sm"
      >
        {events.length === 0 ? (
          <div className="px-2 py-3 text-center text-[10px] font-mono text-[rgba(255,255,255,0.3)]">
            Waiting for on-chain events...
          </div>
        ) : (
          events.slice(0, 10).map((event) => {
            const Icon = EVENT_ICONS[event.type] || Users
            const color = EVENT_COLORS[event.type] || '#fff'
            const message = formatEventMessage(event)
            const timeAgo = Math.floor((nowMs - event.timestamp) / 1000)
            const timeStr = timeAgo < 60 ? `${timeAgo}s` : `${Math.floor(timeAgo / 60)}m`

            return (
              <div
                key={event.id}
                className="flex items-start gap-2 rounded px-2 py-1.5 transition-all"
                style={{
                  backgroundColor: 'rgba(255,255,255,0.04)',
                  borderLeft: `2px solid ${color}`,
                }}
              >
                <Icon className="mt-0.5 h-3 w-3 shrink-0" style={{ color }} />
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-mono text-[rgba(255,255,255,0.85)] leading-tight">
                    {message}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[8px] font-mono text-[rgba(255,255,255,0.35)]">
                      {timeStr} ago
                    </span>
                    <span className="text-[8px] font-mono" style={{ color: color + '80' }}>
                      {event.source === 'testnet' ? 'on-chain' : 'orchestrator'}
                    </span>
                    {event.txHash && (
                      <span className="text-[8px] font-mono text-[rgba(255,255,255,0.25)]">
                        tx:{event.txHash.slice(0, 6)}...
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
