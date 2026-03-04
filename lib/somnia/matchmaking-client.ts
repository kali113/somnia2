'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  backendWsUrl,
  buildBackendApiUrl,
  isBackendConfigured,
  backendConfigError,
} from './runtime-config'

export interface QueueSnapshot {
  players: string[]
  size: number
  maxSize: number
  minPlayers: number
  timeoutSec: number
  openedAt: number | null
  updatedAt: number
  source: 'chain'
}

export interface MatchRecord {
  matchId: number
  gameId: number
  status: 'active' | 'ended'
  players: string[]
  botSlots: number
  totalSlots: number
  prizePool: string
  createdAt: number
  startedAt: number
  endedAt: number | null
  winner: string | null
  txHash: string | null
}

export interface MatchmakingMeResponse {
  address: string
  status: 'idle' | 'queued' | 'matched'
  queuePosition?: number
  queue?: QueueSnapshot
  matchId?: number
  redirectPath?: string
  match?: MatchRecord
}

interface WsEnvelope {
  schemaVersion: number
  type: string
  data: any
}

async function fetchJson<T>(path: string): Promise<T> {
  const url = buildBackendApiUrl(path)
  if (!url) {
    throw new Error('Backend URL is not configured')
  }

  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`)
  }

  return res.json() as Promise<T>
}

export async function fetchQueueSnapshot(): Promise<QueueSnapshot> {
  return fetchJson<QueueSnapshot>('/api/matchmaking/queue')
}

export async function fetchMatchmakingMe(address: string): Promise<MatchmakingMeResponse> {
  return fetchJson<MatchmakingMeResponse>(`/api/matchmaking/me/${address.toLowerCase()}`)
}

export async function fetchMatchById(matchId: number): Promise<MatchRecord> {
  const payload = await fetchJson<{ match: MatchRecord }>(`/api/matchmaking/matches/${matchId}`)
  return payload.match
}

export function useMatchmaking(address?: string) {
  const [queue, setQueue] = useState<QueueSnapshot | null>(null)
  const [me, setMe] = useState<MatchmakingMeResponse | null>(null)
  const [activeMatch, setActiveMatch] = useState<MatchRecord | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [wsConnected, setWsConnected] = useState(false)

  const wsRef = useRef<WebSocket | null>(null)
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const refresh = useCallback(async () => {
    if (!isBackendConfigured) {
      setError(backendConfigError)
      return
    }

    try {
      const [nextQueue, nextMe] = await Promise.all([
        fetchQueueSnapshot(),
        address ? fetchMatchmakingMe(address) : Promise.resolve(null),
      ])

      setQueue(nextQueue)
      setMe(nextMe)

      if (nextMe?.match) {
        setActiveMatch(nextMe.match)
      } else if (typeof nextMe?.matchId === 'number') {
        const match = await fetchMatchById(nextMe.matchId)
        setActiveMatch(match)
      }

      setError(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
    }
  }, [address])

  useEffect(() => {
    let cancelled = false
    const runRefresh = async () => {
      if (cancelled) return
      await refresh()
    }

    runRefresh().catch(() => undefined)

    if (refreshTimerRef.current) {
      clearInterval(refreshTimerRef.current)
    }

    refreshTimerRef.current = setInterval(() => {
      refresh().catch(() => undefined)
    }, 10000)

    return () => {
      cancelled = true
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current)
        refreshTimerRef.current = null
      }
    }
  }, [refresh])

  useEffect(() => {
    if (!isBackendConfigured || !backendWsUrl) {
      return
    }

    const wsUrl = address
      ? `${backendWsUrl}?address=${address.toLowerCase()}`
      : backendWsUrl

    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => {
      setWsConnected(true)
    }

    ws.onclose = () => {
      setWsConnected(false)
      wsRef.current = null
    }

    ws.onerror = () => {
      setError('WebSocket connection failed')
    }

    ws.onmessage = (evt) => {
      try {
        const envelope = JSON.parse(evt.data) as WsEnvelope

        if (envelope.type === 'queue_update') {
          setQueue(envelope.data as QueueSnapshot)
          return
        }

        if (envelope.type === 'match_updated') {
          const match = envelope.data as MatchRecord
          setActiveMatch((prev) => {
            if (!prev) return match
            if (prev.matchId !== match.matchId) return prev
            return match
          })
          return
        }

        if (envelope.type === 'match_assigned') {
          const payload = envelope.data as {
            address: string
            matchId: number
            redirectPath: string
            status: 'active' | 'ended'
          }

          if (address && payload.address.toLowerCase() !== address.toLowerCase()) return

          setMe((prev) => ({
            address: address?.toLowerCase() || payload.address,
            status: 'matched',
            matchId: payload.matchId,
            redirectPath: payload.redirectPath,
            match: prev?.match,
          }))
        }
      } catch {
        // Ignore malformed payloads
      }
    }

    return () => {
      ws.close()
      wsRef.current = null
      setWsConnected(false)
    }
  }, [address])

  return useMemo(() => ({
    queue,
    me,
    activeMatch,
    error,
    wsConnected,
    backendConfigured: isBackendConfigured,
    backendConfigError,
    refresh,
  }), [queue, me, activeMatch, error, wsConnected, refresh])
}
