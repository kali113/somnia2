import { describe, expect, it } from 'vitest'

import { GameStore } from '../store.js'

const ALPHA = '0x00000000000000000000000000000000000000Aa'
const BRAVO = '0x00000000000000000000000000000000000000Bb'
const CHARLIE = '0x00000000000000000000000000000000000000Cc'
const DELTA = '0x00000000000000000000000000000000000000Dd'

describe('game store', () => {
  it('tracks queue state and force-start timing', () => {
    const store = new GameStore()

    store.setQueueConfig({ maxSize: 12, minPlayers: 2, timeoutSec: 90 })
    store.syncQueueFromChain([ALPHA, BRAVO], 100)
    store.setPlayerMode(ALPHA, 'duo')
    store.setPlayerMode(BRAVO, 'duo')
    store.setPlayerMode(CHARLIE, 'squad')

    expect(store.getQueueState()).toMatchObject({
      players: [ALPHA.toLowerCase(), BRAVO.toLowerCase()],
      size: 2,
      maxSize: 12,
      minPlayers: 2,
      timeoutSec: 90,
      openedAt: 100,
      source: 'chain',
    })
    expect(store.isInQueue(ALPHA.toUpperCase())).toBe(true)
    expect(store.getQueueAgeSec(120)).toBe(20)
    expect(store.canForceStart(189)).toBe(false)
    expect(store.canForceStart(190)).toBe(true)
    expect(store.getMatchMode([ALPHA, BRAVO, CHARLIE])).toBe('duo')
    store.setPlayerMode(ALPHA, 'squad')
    store.setPlayerMode(BRAVO, 'squad')
    store.setPlayerMode(CHARLIE, 'squad')
    expect(store.getMatchMode([ALPHA, BRAVO, CHARLIE])).toBe('squad')
    store.setPlayerMode(ALPHA, 'solo')
    expect(store.getMatchMode([ALPHA, BRAVO])).toBe('solo')
    expect(store.getMatchMode([DELTA])).toBe('solo')
  })

  it('tracks active matches, teams, and player assignments', () => {
    const store = new GameStore()

    store.setQueueConfig({ maxSize: 8, minPlayers: 2, timeoutSec: 60 })

    const started = store.recordMatchStarted({
      gameId: 7,
      players: [ALPHA, BRAVO, CHARLIE, DELTA],
      prizePool: '100',
      startedAt: 500,
      txHash: '0xabc',
      mode: 'duo',
    })

    expect(started.status).toBe('active')
    expect(started.players).toEqual([
      ALPHA.toLowerCase(),
      BRAVO.toLowerCase(),
      CHARLIE.toLowerCase(),
      DELTA.toLowerCase(),
    ])
    expect(started.teams).toEqual([
      [ALPHA.toLowerCase(), BRAVO.toLowerCase()],
      [CHARLIE.toLowerCase(), DELTA.toLowerCase()],
    ])
    expect(started.botSlots).toBe(4)
    expect(started.totalSlots).toBe(8)
    expect(store.getMatchForPlayer(ALPHA)?.matchId).toBe(7)
    expect(store.getMatchForPlayer('0x00000000000000000000000000000000000000ff')).toBeUndefined()
    expect(store.getNextGameId()).toBe(0)
    expect(store.getNextGameId()).toBe(1)

    const ended = store.recordMatchEnded({
      gameId: 7,
      winner: ALPHA,
      placements: [ALPHA, BRAVO, CHARLIE, DELTA],
      prizePool: '100',
      endedAt: 640,
      txHash: '0xdef',
    })

    expect(ended.status).toBe('ended')
    expect(ended.winner).toBe(ALPHA.toLowerCase())
    expect(store.getMatch(7)?.txHash).toBe('0xdef')
    expect(store.getMatchForPlayer(ALPHA)).toBeUndefined()

    const inferredModeMatch = store.recordMatchStarted({
      gameId: 8,
      players: [ALPHA, BRAVO, CHARLIE],
      prizePool: '25',
      startedAt: 700,
      txHash: null,
    })
    expect(inferredModeMatch.mode).toBe('solo')

    const endedWithoutExisting = store.recordMatchEnded({
      gameId: 99,
      winner: BRAVO,
      placements: [BRAVO, ALPHA],
      prizePool: '15',
      endedAt: 800,
      txHash: null,
    })
    expect(endedWithoutExisting.players).toEqual([
      BRAVO.toLowerCase(),
      ALPHA.toLowerCase(),
    ])
    expect(endedWithoutExisting.startedAt).toBe(800)
  })

  it('records games, player stats, recent matches, and leaderboard ordering', () => {
    const store = new GameStore()

    expect(store.recordGame({
      gameId: 1,
      timestamp: 100,
      winner: ALPHA,
      placements: [ALPHA, BRAVO, CHARLIE],
      kills: [3, 1, 0],
      prizePool: '200',
      playerCount: 3,
    })).toBe(true)

    expect(store.recordGame({
      gameId: 1,
      timestamp: 100,
      winner: ALPHA,
      placements: [ALPHA, BRAVO, CHARLIE],
      kills: [3, 1, 0],
      prizePool: '200',
      playerCount: 3,
    })).toBe(false)

    expect(store.recordGame({
      gameId: 2,
      timestamp: 200,
      winner: ALPHA,
      placements: [ALPHA, BRAVO, DELTA],
      kills: [2, 5, 1],
      prizePool: '300',
      playerCount: 3,
    })).toBe(true)

    store.getOrCreatePlayer(ALPHA).totalEarned = '100'
    store.getOrCreatePlayer(BRAVO).totalEarned = '150'

    expect(store.getPlayer(ALPHA)).toMatchObject({
      address: ALPHA.toLowerCase(),
      gamesPlayed: 2,
      wins: 2,
      kills: 5,
      deaths: 0,
      matchHistory: [1, 2],
      totalEarned: '100',
    })
    expect(store.getPlayer(BRAVO)).toMatchObject({
      gamesPlayed: 2,
      wins: 0,
      kills: 6,
      deaths: 2,
      totalEarned: '150',
    })
    expect(store.getRecentGames(2).map((game) => game.gameId)).toEqual([2, 1])
    expect(store.getLeaderboard('wins', 1)[0]?.address).toBe(ALPHA.toLowerCase())
    expect(store.getLeaderboard('kills', 1)[0]?.address).toBe(BRAVO.toLowerCase())
    expect(store.getLeaderboard('earned', 1)[0]?.address).toBe(BRAVO.toLowerCase())
  })
})
