'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  backendWsUrl,
  buildBackendApiUrl,
  isBackendConfigured,
  backendConfigError,
  fetchBackendUrl,
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
  const [resolvedWsUrl, setResolvedWsUrl] = useState<string | null>(backendWsUrl)

  const wsRef = useRef<WebSocket | null>(null)
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const refreshRequestIdRef = useRef(0)
  const dismissedMatchIdsRef = useRef<Set<number>>(new Set())

  const mergeMeState = useCallback((
    previous: MatchmakingMeResponse | null,
    next: MatchmakingMeResponse | null,
  ): MatchmakingMeResponse | null => {
    if (!next) {
      return previous
    }

    // Allow downgrade from 'matched' if the match has ended or been dismissed
    if (previous?.status === 'matched' && next.status !== 'matched') {
      // If the previous match is ended, allow the downgrade
      if (previous.match?.status === 'ended') {
        return next
      }
      // If the matchId was dismissed, allow the downgrade
      if (previous.matchId !== undefined && dismissedMatchIdsRef.current.has(previous.matchId)) {
        return next
      }
      // Otherwise keep the matched state (game still active)
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
    // Check at call time (not closure capture time) since fetchBackendUrl
    // may have updated the config after this callback was created
    if (!buildBackendApiUrl('/api/health')) {
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

  const dismissMatch = useCallback((matchId: number) => {
    dismissedMatchIdsRef.current.add(matchId)
    setMe((prev) => {
      if (prev?.matchId === matchId) {
        return { ...prev, status: 'idle', matchId: undefined, redirectPath: undefined, match: undefined }
      }
      return prev
    })
  }, [])

  useEffect(() => {
    let cancelled = false
    const runRefresh = async () => {
      // On GitHub Pages, fetch backend URL from Gist before first refresh
      await fetchBackendUrl()
      if (cancelled) {return}
      // Update WS URL state after fetch (may have changed)
      setResolvedWsUrl(backendWsUrl)
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
    if (!resolvedWsUrl) {
      return
    }

    let ws: WebSocket | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let reconnectAttempt = 0
    let intentionallyClosed = false

    const connect = () => {
      if (intentionallyClosed) {
        return
      }

      const wsUrl = address
        ? `${resolvedWsUrl}?address=${address.toLowerCase()}`
        : resolvedWsUrl

      ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        setWsConnected(true)
        reconnectAttempt = 0
      }

      ws.onclose = () => {
        setWsConnected(false)
        wsRef.current = null

        if (!intentionallyClosed) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempt), 30_000)
          reconnectAttempt++
          reconnectTimer = setTimeout(connect, delay)
        }
      }

      ws.onerror = () => {
        // onclose will fire after onerror, which handles reconnection
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
    }

    connect()

    return () => {
      intentionallyClosed = true
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
      }
      if (ws) {
        ws.close()
      }
      wsRef.current = null
      setWsConnected(false)
    }
  }, [address, resolvedWsUrl])

  return useMemo(() => ({
    queue,
    me,
    activeMatch,
    error,
    wsConnected,
    backendConfigured: isBackendConfigured,
    backendConfigError,
    refresh,
    dismissMatch,
  }), [queue, me, activeMatch, error, wsConnected, refresh, dismissMatch])
}

function prevMatchNeedsFetch(matchId: number): boolean {
  return Number.isFinite(matchId)
}
