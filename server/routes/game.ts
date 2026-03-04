import { Router } from 'express'
import type { GameStore, StoredGameResult } from '../store.js'

export const gameRouter = Router()

/**
 * POST /api/game/result
 * Submit a game result from the game client.
 * The orchestrator backend validates and records it,
 * then submits on-chain via the orchestrator wallet.
 */
gameRouter.post('/result', async (req, res) => {
  const store = (req as any).store as GameStore
  const orchestratorClient = (req as any).orchestratorClient
  const contractAddress = (req as any).contractAddress

  const { placements, kills, gameId: clientGameId } = req.body

  // Validate input
  if (!Array.isArray(placements) || placements.length === 0) {
    return res.status(400).json({ error: 'Invalid placements array' })
  }
  if (!Array.isArray(kills) || kills.length !== placements.length) {
    return res.status(400).json({ error: 'Kills array must match placements length' })
  }

  const gameId = clientGameId ?? store.getNextGameId()

  // Record in-memory
  const result: StoredGameResult = {
    gameId,
    timestamp: Math.floor(Date.now() / 1000),
    winner: placements[0],
    placements,
    kills,
    prizePool: (BigInt(placements.length) * 1000000000000000n).toString(), // 0.001 ETH * players
    playerCount: placements.length,
  }
  store.recordGame(result)

  // Try to submit on-chain if orchestrator wallet is configured
  let txHash: string | null = null
  if (orchestratorClient && String(contractAddress).toLowerCase() !== '0x0000000000000000000000000000000000000000') {
    try {
      // Import ABI for the submitGameResult function
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
      }] as const

      txHash = await orchestratorClient.writeContract({
        address: contractAddress,
        abi,
        functionName: 'submitGameResult',
        args: [BigInt(gameId), placements, kills.map((k: number) => BigInt(k))],
      })

      console.log(`[game] Submitted result for game #${gameId} on-chain: ${txHash}`)
    } catch (e: any) {
      console.error(`[game] Failed to submit on-chain: ${e.message}`)
      // Still record locally even if on-chain submission fails
    }
  } else {
    console.log(`[game] Recorded game #${gameId} locally (no orchestrator configured)`)
  }

  // Broadcast via WebSocket
  const broadcastEvent = (req.app as any).broadcastGameEvent
  if (broadcastEvent) {
    broadcastEvent({
      type: 'game_ended',
      gameId,
      winner: placements[0],
      playerCount: placements.length,
      txHash,
    })
  }

  res.json({
    success: true,
    gameId,
    txHash,
    result,
  })
})

/**
 * GET /api/game/recent
 * Get recent game results.
 */
gameRouter.get('/recent', (req, res) => {
  const store = (req as any).store as GameStore
  const limit = parseInt(req.query.limit as string) || 20
  const games = store.getRecentGames(limit)
  res.json({ games })
})

/**
 * GET /api/game/:id
 * Get a specific game result.
 */
gameRouter.get('/:id', (req, res) => {
  const store = (req as any).store as GameStore
  const gameId = parseInt(req.params.id)
  const game = store.getGame(gameId)

  if (!game) {
    return res.status(404).json({ error: 'Game not found' })
  }

  res.json(game)
})
