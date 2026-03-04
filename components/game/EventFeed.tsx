'use client'

import { useEffect, useRef } from 'react'
import type { SomniaEvent } from '@/lib/somnia/events'
import { formatEventMessage } from '@/lib/somnia/events'
import { Zap, Cloud, Award, Link2, AlertTriangle } from 'lucide-react'

interface EventFeedProps {
  events: SomniaEvent[]
  isLive: boolean
}

const EVENT_ICONS: Record<string, typeof Zap> = {
  supply_drop: Zap,
  storm_change: Cloud,
  kill_milestone: Award,
  chain_connected: Link2,
  chain_error: AlertTriangle,
}

const EVENT_COLORS: Record<string, string> = {
  supply_drop: '#00e5ff',
  storm_change: '#7b2dff',
  kill_milestone: '#ffd700',
  chain_connected: '#4cff4c',
  chain_error: '#ff4444',
}

export default function EventFeed({ events, isLive }: EventFeedProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0
    }
  }, [events.length])

  return (
    <div className="absolute left-3 top-16 z-10 w-64 pointer-events-none">
      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        <div className="flex items-center gap-1.5 rounded-t-lg bg-[rgba(0,0,0,0.8)] px-3 py-1.5 backdrop-blur-sm">
          <div
            className="h-2 w-2 rounded-full"
            style={{
              backgroundColor: isLive ? '#4cff4c' : '#ffcc00',
              boxShadow: `0 0 6px ${isLive ? '#4cff4c' : '#ffcc00'}`,
            }}
          />
          <span className="text-[10px] font-mono text-[rgba(255,255,255,0.7)]">
            SOMNIA {isLive ? 'TESTNET' : 'DEMO'}
          </span>
        </div>
      </div>

      {/* Events */}
      <div
        ref={scrollRef}
        className="flex flex-col gap-0.5 max-h-48 overflow-hidden rounded-b-lg rounded-tr-lg bg-[rgba(0,0,0,0.6)] p-1.5 backdrop-blur-sm"
      >
        {events.length === 0 ? (
          <div className="px-2 py-3 text-center text-[10px] font-mono text-[rgba(255,255,255,0.3)]">
            Waiting for reactive events...
          </div>
        ) : (
          events.slice(0, 10).map((event) => {
            const Icon = EVENT_ICONS[event.type] || Zap
            const color = EVENT_COLORS[event.type] || '#fff'
            const message = formatEventMessage(event)
            const timeAgo = Math.floor((Date.now() - event.timestamp) / 1000)
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
                      {event.source === 'testnet' ? 'on-chain' : 'simulated'}
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
