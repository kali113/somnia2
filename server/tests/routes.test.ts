import express from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import type {
  Address,
  PublicClient,
} from 'viem'

import { setServerLocals } from '../http.js'
import { leaderboardRouter } from '../routes/leaderboard.js'
import { matchmakingRouter } from '../routes/matchmaking.js'
import { playerRouter } from '../routes/player.js'
import { queueRouter } from '../routes/queue.js'
import { GameStore } from '../store.js'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address
const ALPHA = '0x00000000000000000000000000000000000000Aa'
const BRAVO = '0x00000000000000000000000000000000000000Bb'
const CHARLIE = '0x00000000000000000000000000000000000000Cc'
const DELTA = '0x00000000000000000000000000000000000000Dd'
const OMEGA = '0x00000000000000000000000000000000000000Ee'

function createApp() {
  const app = express()
  const store = new GameStore()

  store.setQueueConfig({ maxSize: 20, minPlayers: 2, timeoutSec: 120 })
  store.syncQueueFromChain([ALPHA, BRAVO], 100)
  store.recordMatchStarted({
    gameId: 7,
    players: [CHARLIE, DELTA],
    prizePool: '500',
    startedAt: 150,
    txHash: null,
    mode: 'duo',
  })
  store.recordGame({
    gameId: 3,
    timestamp: 200,
    winner: ALPHA,
    placements: [ALPHA, BRAVO],
    kills: [2, 1],
    prizePool: '10',
    playerCount: 2,
  })
  store.getOrCreatePlayer(ALPHA).totalEarned = '50'
  store.getOrCreatePlayer(BRAVO).totalEarned = '25'

  app.use(express.json())
  setServerLocals(app, {
    contractAddress: ZERO_ADDRESS,
    orchestratorApiToken: '',
    orchestratorClient: null,
    publicClient: {} as PublicClient,
    store,
  })
  app.use('/api/player', playerRouter)
  app.use('/api/queue', queueRouter)
  app.use('/api/leaderboard', leaderboardRouter)
  app.use('/api/matchmaking', matchmakingRouter)

  return request(app)
}

describe('server routes', () => {
  it('serves queue state and rejects deprecated queue mutations', async () => {
    const api = createApp()

    const status = await api.get('/api/queue/status').expect(200)
    const statusBody = status.body as {
      players: string[]
      size: number
      source: string
    }

    expect(statusBody).toMatchObject({
      players: [ALPHA.toLowerCase(), BRAVO.toLowerCase()],
      size: 2,
      source: 'chain',
    })

    await api.post('/api/queue/join').expect(410)
    await api.post('/api/queue/leave').expect(410)
    await api.post('/api/queue/mode').expect(410)

    const queue = await api.get('/api/matchmaking/queue').expect(200)
    const queueBody = queue.body as { size: number }
    expect(queueBody.size).toBe(2)
  })

  it('returns matched, queued, and idle matchmaking responses with validation', async () => {
    const api = createApp()

    await api.get('/api/matchmaking/me/not-an-address').expect(400)

    const queued = await api.get(`/api/matchmaking/me/${ALPHA}`).expect(200)
    expect(queued.body).toMatchObject({
      address: ALPHA.toLowerCase(),
      status: 'queued',
      queuePosition: 1,
    })

    const matched = await api.get(`/api/matchmaking/me/${CHARLIE.toUpperCase()}`).expect(200)
    expect(matched.body).toMatchObject({
      address: CHARLIE.toLowerCase(),
      status: 'matched',
      matchId: 7,
      redirectPath: '/game?matchId=7',
    })

    const idle = await api.get(`/api/matchmaking/me/${OMEGA}`).expect(200)
    expect(idle.body).toEqual({
      address: OMEGA.toLowerCase(),
      status: 'idle',
    })

    await api.get('/api/matchmaking/matches/not-a-number').expect(400)
    await api.get('/api/matchmaking/matches/999').expect(404)

    const match = await api.get('/api/matchmaking/matches/7').expect(200)
    const matchBody = match.body as {
      match: {
        players: string[]
      }
    }

    expect(matchBody.match.players).toEqual([
      CHARLIE.toLowerCase(),
      DELTA.toLowerCase(),
    ])
  })

  it('returns player stats, player history, and leaderboard slices', async () => {
    const api = createApp()

    await api.get('/api/player/not-an-address/stats').expect(400)

    const emptyStats = await api.get(`/api/player/${OMEGA}/stats`).expect(200)
    expect(emptyStats.body).toEqual({
      address: OMEGA.toLowerCase(),
      gamesPlayed: 0,
      wins: 0,
      kills: 0,
      deaths: 0,
      totalEarned: '0',
      matchHistory: [],
    })

    const stats = await api.get(`/api/player/${ALPHA}/stats`).expect(200)
    expect(stats.body).toMatchObject({
      address: ALPHA.toLowerCase(),
      gamesPlayed: 1,
      wins: 1,
      kills: 2,
      totalEarned: '50',
    })

    await api.get('/api/player/not-an-address/history').expect(400)

    const history = await api.get(`/api/player/${ALPHA}/history?limit=1`).expect(200)
    const historyBody = history.body as {
      games: Array<{ gameId: number }>
    }
    expect(historyBody.games).toHaveLength(1)
    expect(historyBody.games[0]?.gameId).toBe(3)

    const emptyHistory = await api.get(`/api/player/${OMEGA}/history`).expect(200)
    expect(emptyHistory.body).toEqual({ games: [] })

    const leaderboard = await api.get('/api/leaderboard?sort=earned&limit=1').expect(200)
    const leaderboardBody = leaderboard.body as {
      leaderboard: Array<{ address: string }>
    }
    expect(leaderboardBody.leaderboard).toHaveLength(1)
    expect(leaderboardBody.leaderboard[0]?.address).toBe(ALPHA.toLowerCase())

    const defaultLeaderboard = await api.get('/api/leaderboard').expect(200)
    const defaultLeaderboardBody = defaultLeaderboard.body as {
      leaderboard: Array<{ address: string }>
    }
    expect(defaultLeaderboardBody.leaderboard[0]?.address).toBe(ALPHA.toLowerCase())
  })
})
