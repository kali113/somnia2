import { decodeEventLog, parseAbi, } from 'viem';
const INDEXER_ABI = parseAbi([
    'function getQueuePlayers() view returns (address[])',
    'function queueOpenedAt() view returns (uint256)',
    'function MAX_PLAYERS() view returns (uint256)',
    'function MIN_PLAYERS() view returns (uint256)',
    'function QUEUE_TIMEOUT() view returns (uint256)',
    'event PlayerJoinedQueue(address indexed player, uint256 queueSize)',
    'event PlayerLeftQueue(address indexed player, uint256 queueSize)',
    'event GameStarted(uint256 indexed gameId, address[] players, uint256 prizePool)',
    'event GameEnded(uint256 indexed gameId, address indexed winner, address[] placements, uint256 prizePool)',
    'event RewardClaimed(address indexed player, uint256 amount)',
    'event SessionKeyApproved(address indexed player, address indexed sessionKey, uint256 expiry)',
    'event SessionKeyRevoked(address indexed player, address indexed sessionKey)',
]);
/**
 * Listens for on-chain events from the PixelRoyale contract
 * and indexes them into the in-memory store.
 */
export class Indexer {
    client;
    contractAddress;
    store;
    onEvent;
    polling = null;
    running = false;
    constructor(client, contractAddress, store, onEvent) {
        this.client = client;
        this.contractAddress = contractAddress;
        this.store = store;
        this.onEvent = onEvent;
    }
    async start() {
        if (this.running)
            return;
        this.running = true;
        console.log('[indexer] Starting event indexer...');
        console.log(`[indexer] Watching contract: ${this.contractAddress}`);
        await this.syncChainConfig();
        await this.syncQueueState();
        let lastBlock = await this.client.getBlockNumber();
        console.log(`[indexer] Starting from block ${lastBlock}`);
        this.polling = setInterval(async () => {
            try {
                const currentBlock = await this.client.getBlockNumber();
                if (currentBlock > lastBlock) {
                    const logs = await this.client.getLogs({
                        address: this.contractAddress,
                        fromBlock: lastBlock + 1n,
                        toBlock: currentBlock,
                    });
                    for (const log of logs) {
                        await this.processLog(log);
                    }
                    lastBlock = currentBlock;
                }
                await this.syncQueueState();
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                console.warn(`[indexer] Poll failed: ${message}`);
            }
        }, 5000);
    }
    stop() {
        if (this.polling) {
            clearInterval(this.polling);
            this.polling = null;
        }
        this.running = false;
    }
    async syncChainConfig() {
        const [maxPlayers, minPlayers, timeout] = await Promise.all([
            this.client.readContract({
                address: this.contractAddress,
                abi: INDEXER_ABI,
                functionName: 'MAX_PLAYERS',
            }),
            this.client.readContract({
                address: this.contractAddress,
                abi: INDEXER_ABI,
                functionName: 'MIN_PLAYERS',
            }),
            this.client.readContract({
                address: this.contractAddress,
                abi: INDEXER_ABI,
                functionName: 'QUEUE_TIMEOUT',
            }),
        ]);
        this.store.setQueueConfig({
            maxSize: Number(maxPlayers),
            minPlayers: Number(minPlayers),
            timeoutSec: Number(timeout),
        });
    }
    async syncQueueState() {
        const [playersRaw, openedAtRaw] = await Promise.all([
            this.client.readContract({
                address: this.contractAddress,
                abi: INDEXER_ABI,
                functionName: 'getQueuePlayers',
            }),
            this.client.readContract({
                address: this.contractAddress,
                abi: INDEXER_ABI,
                functionName: 'queueOpenedAt',
            }),
        ]);
        const players = playersRaw.map((p) => p.toLowerCase());
        const openedAt = openedAtRaw > 0n ? Number(openedAtRaw) : null;
        const prev = this.store.getQueueState();
        const changed = prev.openedAt !== openedAt ||
            prev.players.length !== players.length ||
            prev.players.some((player, idx) => player !== players[idx]);
        if (changed) {
            this.store.syncQueueFromChain(players, openedAt);
            this.onEvent({ type: 'queue_synced' });
        }
    }
    async processLog(log) {
        try {
            if (log.topics.length === 0)
                return;
            const parsed = decodeEventLog({
                abi: INDEXER_ABI,
                topics: [...log.topics],
                data: log.data,
            });
            const txHash = log.transactionHash ?? null;
            if (parsed.eventName === 'PlayerJoinedQueue') {
                this.onEvent({
                    type: 'queue_joined',
                    player: parsed.args.player.toLowerCase(),
                    queueSize: Number(parsed.args.queueSize),
                    txHash,
                });
                return;
            }
            if (parsed.eventName === 'PlayerLeftQueue') {
                this.onEvent({
                    type: 'queue_left',
                    player: parsed.args.player.toLowerCase(),
                    queueSize: Number(parsed.args.queueSize),
                    txHash,
                });
                return;
            }
            if (parsed.eventName === 'GameStarted') {
                const timestamp = await this.getBlockTimestamp(log.blockNumber);
                const players = parsed.args.players.map((p) => p.toLowerCase());
                const prizePool = parsed.args.prizePool.toString();
                this.store.recordMatchStarted({
                    gameId: Number(parsed.args.gameId),
                    players,
                    prizePool,
                    startedAt: timestamp,
                    txHash,
                });
                this.onEvent({
                    type: 'game_started',
                    gameId: Number(parsed.args.gameId),
                    players,
                    prizePool,
                    txHash,
                });
                return;
            }
            if (parsed.eventName === 'GameEnded') {
                const timestamp = await this.getBlockTimestamp(log.blockNumber);
                const placements = parsed.args.placements.map((p) => p.toLowerCase());
                const gameId = Number(parsed.args.gameId);
                const winner = parsed.args.winner.toLowerCase();
                const prizePool = parsed.args.prizePool.toString();
                this.store.recordMatchEnded({
                    gameId,
                    winner,
                    placements,
                    prizePool,
                    endedAt: timestamp,
                    txHash,
                });
                this.store.recordGame({
                    gameId,
                    timestamp,
                    winner,
                    placements,
                    kills: placements.map(() => 0),
                    prizePool,
                    playerCount: placements.length,
                });
                this.onEvent({
                    type: 'game_ended',
                    gameId,
                    winner,
                    placements,
                    prizePool,
                    txHash,
                });
                return;
            }
            if (parsed.eventName === 'RewardClaimed') {
                this.onEvent({
                    type: 'reward_claimed',
                    player: parsed.args.player.toLowerCase(),
                    amount: parsed.args.amount.toString(),
                    txHash,
                });
                return;
            }
            if (parsed.eventName === 'SessionKeyApproved') {
                this.onEvent({
                    type: 'session_approved',
                    player: parsed.args.player.toLowerCase(),
                    sessionKey: parsed.args.sessionKey.toLowerCase(),
                    expiry: Number(parsed.args.expiry),
                    txHash,
                });
                return;
            }
            if (parsed.eventName === 'SessionKeyRevoked') {
                this.onEvent({
                    type: 'session_revoked',
                    player: parsed.args.player.toLowerCase(),
                    sessionKey: parsed.args.sessionKey.toLowerCase(),
                    txHash,
                });
            }
        }
        catch {
            // Ignore unknown log payloads from the same contract
        }
    }
    async getBlockTimestamp(blockNumber) {
        if (blockNumber === null) {
            return Math.floor(Date.now() / 1000);
        }
        try {
            const block = await this.client.getBlock({ blockNumber });
            return Number(block.timestamp);
        }
        catch {
            return Math.floor(Date.now() / 1000);
        }
    }
}
