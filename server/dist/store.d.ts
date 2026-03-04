/**
 * In-memory data store for the game server.
 * For a production app, replace with a database (Postgres, SQLite, etc.)
 */
export interface StoredGameResult {
    gameId: number;
    timestamp: number;
    winner: string;
    placements: string[];
    kills: number[];
    prizePool: string;
    playerCount: number;
}
export interface PlayerRecord {
    address: string;
    gamesPlayed: number;
    wins: number;
    kills: number;
    deaths: number;
    totalEarned: string;
    matchHistory: number[];
}
export interface QueueState {
    players: string[];
    size: number;
    maxSize: number;
    minPlayers: number;
    timeoutSec: number;
    openedAt: number | null;
    updatedAt: number;
    source: 'chain';
}
export type MatchStatus = 'active' | 'ended';
export interface MatchRecord {
    matchId: number;
    gameId: number;
    status: MatchStatus;
    players: string[];
    botSlots: number;
    totalSlots: number;
    prizePool: string;
    createdAt: number;
    startedAt: number;
    endedAt: number | null;
    winner: string | null;
    txHash: string | null;
}
export declare class GameStore {
    private games;
    private players;
    private queuePlayers;
    private queueOpenedAt;
    private queueUpdatedAt;
    private queueMaxSize;
    private queueMinPlayers;
    private queueTimeoutSec;
    private matches;
    private playerToMatch;
    private nextGameId;
    setQueueConfig(config: {
        maxSize: number;
        minPlayers: number;
        timeoutSec: number;
    }): void;
    syncQueueFromChain(players: string[], openedAt: number | null): void;
    getQueueState(): QueueState;
    isInQueue(address: string): boolean;
    getQueueAgeSec(nowSec?: number): number;
    canForceStart(nowSec?: number): boolean;
    recordMatchStarted(input: {
        gameId: number;
        players: string[];
        prizePool: string;
        startedAt: number;
        txHash: string | null;
    }): MatchRecord;
    recordMatchEnded(input: {
        gameId: number;
        winner: string;
        placements: string[];
        prizePool: string;
        endedAt: number;
        txHash: string | null;
    }): MatchRecord;
    getMatch(matchId: number): MatchRecord | undefined;
    getMatchForPlayer(address: string): MatchRecord | undefined;
    recordGame(result: StoredGameResult): boolean;
    getGame(gameId: number): StoredGameResult | undefined;
    getRecentGames(count: number): StoredGameResult[];
    getNextGameId(): number;
    getOrCreatePlayer(address: string): PlayerRecord;
    getPlayer(address: string): PlayerRecord | undefined;
    getLeaderboard(sortBy?: 'wins' | 'kills' | 'earned', limit?: number): PlayerRecord[];
}
