/**
 * In-memory data store for the game server.
 * For a production app, replace with a database (Postgres, SQLite, etc.)
 */

export interface StoredGameResult {
  gameId: number
  timestamp: number
  winner: string
  placements: string[]
  kills: number[]
  prizePool: string // wei as string
  playerCount: number
}

export interface PlayerRecord {
  address: string
  gamesPlayed: number
  wins: number
  kills: number
  deaths: number
  totalEarned: string // wei as string
  matchHistory: number[] // gameIds
}

export interface QueueState {
  players: string[]
  size: number
  maxSize: number
  openedAt: number | null
}

export class GameStore {
  private games: Map<number, StoredGameResult> = new Map()
  private players: Map<string, PlayerRecord> = new Map()
  private queue: string[] = []
  private queueOpenedAt: number | null = null
  private nextGameId: number = 0

  // ── Queue ───────────────────────────────────────────────────────────────

  getQueueState(): QueueState {
    return {
      players: [...this.queue],
      size: this.queue.length,
      maxSize: 20,
      openedAt: this.queueOpenedAt,
    }
  }

  addToQueue(address: string): boolean {
    const addr = address.toLowerCase()
    if (this.queue.includes(addr) || this.queue.length >= 20) return false
    if (this.queue.length === 0) {
      this.queueOpenedAt = Date.now()
    }
    this.queue.push(addr)
    return true
  }

  removeFromQueue(address: string): boolean {
    const addr = address.toLowerCase()
    const index = this.queue.indexOf(addr)
    if (index === -1) return false
    this.queue.splice(index, 1)
    if (this.queue.length === 0) this.queueOpenedAt = null
    return true
  }

  isInQueue(address: string): boolean {
    return this.queue.includes(address.toLowerCase())
  }

  clearQueue(): string[] {
    const players = [...this.queue]
    this.queue = []
    this.queueOpenedAt = null
    return players
  }

  // ── Games ───────────────────────────────────────────────────────────────

  recordGame(result: StoredGameResult): void {
    this.games.set(result.gameId, result)

    // Update player records
    for (let i = 0; i < result.placements.length; i++) {
      const addr = result.placements[i].toLowerCase()
      const player = this.getOrCreatePlayer(addr)
      player.gamesPlayed++
      player.kills += result.kills[i] || 0
      player.matchHistory.push(result.gameId)
      if (i === 0) player.wins++
      if (i > 0) player.deaths++
    }
  }

  getGame(gameId: number): StoredGameResult | undefined {
    return this.games.get(gameId)
  }

  getRecentGames(count: number): StoredGameResult[] {
    const all = Array.from(this.games.values())
    return all.sort((a, b) => b.timestamp - a.timestamp).slice(0, count)
  }

  getNextGameId(): number {
    return this.nextGameId++
  }

  // ── Players ─────────────────────────────────────────────────────────────

  getOrCreatePlayer(address: string): PlayerRecord {
    const addr = address.toLowerCase()
    let player = this.players.get(addr)
    if (!player) {
      player = {
        address: addr,
        gamesPlayed: 0,
        wins: 0,
        kills: 0,
        deaths: 0,
        totalEarned: '0',
        matchHistory: [],
      }
      this.players.set(addr, player)
    }
    return player
  }

  getPlayer(address: string): PlayerRecord | undefined {
    return this.players.get(address.toLowerCase())
  }

  // ── Leaderboard ─────────────────────────────────────────────────────────

  getLeaderboard(sortBy: 'wins' | 'kills' | 'earned' = 'wins', limit: number = 20): PlayerRecord[] {
    const all = Array.from(this.players.values())

    switch (sortBy) {
      case 'wins':
        all.sort((a, b) => b.wins - a.wins || b.gamesPlayed - a.gamesPlayed)
        break
      case 'kills':
        all.sort((a, b) => b.kills - a.kills)
        break
      case 'earned':
        all.sort((a, b) => Number(BigInt(b.totalEarned) - BigInt(a.totalEarned)))
        break
    }

    return all.slice(0, limit)
  }
}
