import { type Address, type PublicClient } from 'viem';
import { GameStore } from './store.js';
export type IndexedEvent = {
    type: 'queue_joined';
    player: string;
    queueSize: number;
    txHash: string | null;
} | {
    type: 'queue_left';
    player: string;
    queueSize: number;
    txHash: string | null;
} | {
    type: 'queue_synced';
} | {
    type: 'game_started';
    gameId: number;
    players: string[];
    prizePool: string;
    txHash: string | null;
} | {
    type: 'game_ended';
    gameId: number;
    winner: string;
    placements: string[];
    prizePool: string;
    txHash: string | null;
} | {
    type: 'reward_claimed';
    player: string;
    amount: string;
    txHash: string | null;
} | {
    type: 'session_approved';
    player: string;
    sessionKey: string;
    expiry: number;
    txHash: string | null;
} | {
    type: 'session_revoked';
    player: string;
    sessionKey: string;
    txHash: string | null;
};
/**
 * Listens for on-chain events from the PixelRoyale contract
 * and indexes them into the in-memory store.
 */
export declare class Indexer {
    private client;
    private contractAddress;
    private store;
    private onEvent;
    private polling;
    private running;
    constructor(client: PublicClient, contractAddress: Address, store: GameStore, onEvent: (event: IndexedEvent) => void);
    start(): Promise<void>;
    stop(): void;
    private syncChainConfig;
    private syncQueueState;
    private processLog;
    private getBlockTimestamp;
}
