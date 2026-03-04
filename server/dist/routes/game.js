import { Router } from 'express';
export const gameRouter = Router();
/**
 * POST /api/game/result
 * Submit a game result from the game client.
 * The orchestrator backend validates and records it,
 * then submits on-chain via the orchestrator wallet.
 */
gameRouter.post('/result', async (req, res) => {
    const store = req.store;
    const orchestratorClient = req.orchestratorClient;
    const contractAddress = req.contractAddress;
    const { placements, kills, gameId: clientGameId } = req.body;
    // Validate input
    if (!Array.isArray(placements) || placements.length === 0) {
        return res.status(400).json({ error: 'Invalid placements array' });
    }
    if (!Array.isArray(kills) || kills.length !== placements.length) {
        return res.status(400).json({ error: 'Kills array must match placements length' });
    }
    const gameId = clientGameId ?? store.getNextGameId();
    // Record in-memory
    const result = {
        gameId,
        timestamp: Math.floor(Date.now() / 1000),
        winner: placements[0],
        placements,
        kills,
        prizePool: (BigInt(placements.length) * 1000000000000000n).toString(), // 0.001 ETH * players
        playerCount: placements.length,
    };
    const inserted = store.recordGame(result);
    // Keep matchmaking state coherent even before GameEnded is indexed back.
    store.recordMatchEnded({
        gameId,
        winner: placements[0],
        placements,
        prizePool: result.prizePool,
        endedAt: result.timestamp,
        txHash: null,
    });
    // Try to submit on-chain if orchestrator wallet is configured
    let txHash = null;
    if (orchestratorClient && contractAddress) {
        try {
            const abi = [{
                    type: 'function',
                    name: 'submitGameResult',
                    inputs: [
                        { name: '_gameId', type: 'uint256' },
                        { name: '_placements', type: 'address[]' },
                        { name: '_kills', type: 'uint256[]' },
                    ],
                    outputs: [],
                    stateMutability: 'nonpayable',
                }];
            txHash = await orchestratorClient.writeContract({
                address: contractAddress,
                abi,
                functionName: 'submitGameResult',
                args: [BigInt(gameId), placements, kills.map((k) => BigInt(k))],
            });
            console.log(`[game] Submitted result for game #${gameId} on-chain: ${txHash}`);
        }
        catch (e) {
            console.error(`[game] Failed to submit on-chain: ${e.message}`);
            // Still record locally even if on-chain submission fails
        }
    }
    else {
        console.log(`[game] Recorded game #${gameId} locally (no orchestrator configured)`);
    }
    // Broadcast via WebSocket
    const broadcastEvent = req.app.broadcastGameEvent;
    if (broadcastEvent) {
        broadcastEvent({
            type: 'game_ended',
            gameId,
            winner: placements[0],
            playerCount: placements.length,
            txHash,
        });
    }
    res.json({
        success: true,
        inserted,
        gameId,
        txHash,
        result,
    });
});
/**
 * GET /api/game/recent
 * Get recent game results.
 */
gameRouter.get('/recent', (req, res) => {
    const store = req.store;
    const limit = parseInt(req.query.limit) || 20;
    const games = store.getRecentGames(limit);
    res.json({ games });
});
/**
 * GET /api/game/:id
 * Get a specific game result.
 */
gameRouter.get('/:id', (req, res) => {
    const store = req.store;
    const gameId = parseInt(req.params.id);
    const game = store.getGame(gameId);
    if (!game) {
        return res.status(404).json({ error: 'Game not found' });
    }
    res.json(game);
});
