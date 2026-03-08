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
  mode?: 'solo' | 'duo' | 'squad'
  teams?: string[][]
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
  data: unknown
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

  return await (res.json() as Promise<T>)
}

export async function fetchQueueSnapshot(): Promise<QueueSnapshot> {
  return await fetchJson<QueueSnapshot>('/api/matchmaking/queue')
}

export async function fetchMatchmakingMe(address: string): Promise<MatchmakingMeResponse> {
  return await fetchJson<MatchmakingMeResponse>(`/api/matchmaking/me/${address.toLowerCase()}`)
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
  const refreshRequestIdRef = useRef(0)

  const mergeMeState = useCallback((
    previous: MatchmakingMeResponse | null,
    next: MatchmakingMeResponse | null,
  ): MatchmakingMeResponse | null => {
    if (!next) {
      return previous
    }

    if (previous?.status === 'matched' && next.status !== 'matched') {
      return previous
    }

    if (previous?.status === 'matched' && next.status === 'matched') {
      return {
        ...previous,
        ...next,
        match: next.match ?? previous.match,
        redirectPath: next.redirectPath ?? previous.redirectPath,
      }
    }

    return next
  }, [])

  const refresh = useCallback(async () => {
    if (!isBackendConfigured) {
      return
    }

    const requestId = ++refreshRequestIdRef.current

    try {
      const [nextQueue, nextMe] = await Promise.all([
        fetchQueueSnapshot(),
        address ? fetchMatchmakingMe(address) : Promise.resolve(null),
      ])

      if (requestId !== refreshRequestIdRef.current) {
        return
      }

      setQueue(nextQueue)
      setMe((prev) => mergeMeState(prev, nextMe))

      if (nextMe?.match) {
        setActiveMatch(nextMe.match)
      } else if (typeof nextMe?.matchId === 'number') {
        const match = await fetchMatchById(nextMe.matchId)
        setActiveMatch(match)
      }

      setError(null)
    } catch (err) {
      if (requestId !== refreshRequestIdRef.current) {
        return
      }
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
    }
  }, [address, mergeMeState])

  useEffect(() => {
    let cancelled = false
    const runRefresh = async () => {
      if (cancelled) {return}
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
        if (typeof evt.data !== 'string') {
          return
        }

        const envelope = JSON.parse(evt.data) as WsEnvelope

        if (envelope.type === 'queue_update') {
          setQueue(envelope.data as QueueSnapshot)
          return
        }

        if (envelope.type === 'match_updated') {
          const match = envelope.data as MatchRecord
          setActiveMatch((prev) => {
            if (!prev) {return match}
            if (prev.matchId !== match.matchId) {return prev}
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

          if (address && payload.address.toLowerCase() !== address.toLowerCase()) {return}

          refreshRequestIdRef.current += 1
          setMe((prev) => ({
            address: address?.toLowerCase() || payload.address,
            status: 'matched',
            matchId: payload.matchId,
            redirectPath: payload.redirectPath,
            match: prev?.match,
          }))

          if (prevMatchNeedsFetch(payload.matchId)) {
            fetchMatchById(payload.matchId).then((match) => {
              setActiveMatch(match)
              setMe((prev) => prev ? { ...prev, match } : prev)
            }).catch(() => undefined)
          }
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

function prevMatchNeedsFetch(matchId: number): boolean {
  return Number.isFinite(matchId)
}
