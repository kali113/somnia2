/**
 * In-memory data store for the game server.
 * For a production app, replace with a database (Postgres, SQLite, etc.)
 */
export class GameStore {
    games = new Map();
    players = new Map();
    queuePlayers = [];
    queueOpenedAt = null;
    queueUpdatedAt = Math.floor(Date.now() / 1000);
    queueMaxSize = 20;
    queueMinPlayers = 2;
    queueTimeoutSec = 120;
    matches = new Map();
    playerToMatch = new Map();
    nextGameId = 0;
    // ── Queue (on-chain mirrored) ───────────────────────────────────────────
    setQueueConfig(config) {
        this.queueMaxSize = config.maxSize;
        this.queueMinPlayers = config.minPlayers;
        this.queueTimeoutSec = config.timeoutSec;
    }
    syncQueueFromChain(players, openedAt) {
        this.queuePlayers = players.map((p) => p.toLowerCase());
        this.queueOpenedAt = openedAt;
        this.queueUpdatedAt = Math.floor(Date.now() / 1000);
    }
    getQueueState() {
        return {
            players: [...this.queuePlayers],
            size: this.queuePlayers.length,
            maxSize: this.queueMaxSize,
            minPlayers: this.queueMinPlayers,
            timeoutSec: this.queueTimeoutSec,
            openedAt: this.queueOpenedAt,
            updatedAt: this.queueUpdatedAt,
            source: 'chain',
        };
    }
    isInQueue(address) {
        return this.queuePlayers.includes(address.toLowerCase());
    }
    getQueueAgeSec(nowSec = Math.floor(Date.now() / 1000)) {
        if (!this.queueOpenedAt)
            return 0;
        return Math.max(0, nowSec - this.queueOpenedAt);
    }
    canForceStart(nowSec = Math.floor(Date.now() / 1000)) {
        if (this.queuePlayers.length < this.queueMinPlayers)
            return false;
        if (!this.queueOpenedAt)
            return false;
        return nowSec >= this.queueOpenedAt + this.queueTimeoutSec;
    }
    // ── Matchmaking lifecycle ────────────────────────────────────────────────
    recordMatchStarted(input) {
        const playerAddresses = input.players.map((p) => p.toLowerCase());
        const existing = this.matches.get(input.gameId);
        const match = {
            matchId: input.gameId,
            gameId: input.gameId,
            status: 'active',
            players: playerAddresses,
            botSlots: Math.max(0, this.queueMaxSize - playerAddresses.length),
            totalSlots: this.queueMaxSize,
            prizePool: input.prizePool,
            createdAt: existing?.createdAt ?? input.startedAt,
            startedAt: input.startedAt,
            endedAt: null,
            winner: null,
            txHash: input.txHash,
        };
        this.matches.set(match.matchId, match);
        for (const player of playerAddresses) {
            this.playerToMatch.set(player, match.matchId);
        }
        return match;
    }
    recordMatchEnded(input) {
        const playerAddresses = input.placements.map((p) => p.toLowerCase());
        const existing = this.matches.get(input.gameId);
        const match = {
            matchId: input.gameId,
            gameId: input.gameId,
            status: 'ended',
            players: existing?.players ?? playerAddresses,
            botSlots: existing?.botSlots ?? Math.max(0, this.queueMaxSize - playerAddresses.length),
            totalSlots: existing?.totalSlots ?? this.queueMaxSize,
            prizePool: input.prizePool,
            createdAt: existing?.createdAt ?? input.endedAt,
            startedAt: existing?.startedAt ?? input.endedAt,
            endedAt: input.endedAt,
            winner: input.winner.toLowerCase(),
            txHash: input.txHash,
        };
        this.matches.set(match.matchId, match);
        for (const player of playerAddresses) {
            const assignedMatchId = this.playerToMatch.get(player);
            if (assignedMatchId === input.gameId) {
                this.playerToMatch.delete(player);
            }
        }
        return match;
    }
    getMatch(matchId) {
        return this.matches.get(matchId);
    }
    getMatchForPlayer(address) {
        const matchId = this.playerToMatch.get(address.toLowerCase());
        if (matchId === undefined)
            return undefined;
        return this.matches.get(matchId);
    }
    // ── Games ───────────────────────────────────────────────────────────────
    recordGame(result) {
        if (this.games.has(result.gameId)) {
            return false;
        }
        this.games.set(result.gameId, result);
        // Update player records
        for (let i = 0; i < result.placements.length; i++) {
            const addr = result.placements[i].toLowerCase();
            const player = this.getOrCreatePlayer(addr);
            player.gamesPlayed++;
            player.kills += result.kills[i] || 0;
            player.matchHistory.push(result.gameId);
            if (i === 0)
                player.wins++;
            if (i > 0)
                player.deaths++;
        }
        return true;
    }
    getGame(gameId) {
        return this.games.get(gameId);
    }
    getRecentGames(count) {
        const all = Array.from(this.games.values());
        return all.sort((a, b) => b.timestamp - a.timestamp).slice(0, count);
    }
    getNextGameId() {
        return this.nextGameId++;
    }
    // ── Players ─────────────────────────────────────────────────────────────
    getOrCreatePlayer(address) {
        const addr = address.toLowerCase();
        let player = this.players.get(addr);
        if (!player) {
            player = {
                address: addr,
                gamesPlayed: 0,
                wins: 0,
                kills: 0,
                deaths: 0,
                totalEarned: '0',
                matchHistory: [],
            };
            this.players.set(addr, player);
        }
        return player;
    }
    getPlayer(address) {
        return this.players.get(address.toLowerCase());
    }
    // ── Leaderboard ─────────────────────────────────────────────────────────
    getLeaderboard(sortBy = 'wins', limit = 20) {
        const all = Array.from(this.players.values());
        switch (sortBy) {
            case 'wins':
                all.sort((a, b) => b.wins - a.wins || b.gamesPlayed - a.gamesPlayed);
                break;
            case 'kills':
                all.sort((a, b) => b.kills - a.kills);
                break;
            case 'earned':
                all.sort((a, b) => Number(BigInt(b.totalEarned) - BigInt(a.totalEarned)));
                break;
        }
        return all.slice(0, limit);
    }
}
