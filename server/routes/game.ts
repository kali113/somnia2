import { Router } from 'express'
import { decodeEventLog } from 'viem'
import type { GameStore, StoredGameResult } from '../store.js'

export const gameRouter = Router()

const STORM_ABI = [
  {
    type: 'function',
    name: 'stormCircles',
    stateMutability: 'view',
    inputs: [
      { name: '_gameId', type: 'uint256' },
      { name: '_phase', type: 'uint8' },
    ],
    outputs: [
      { name: 'committed', type: 'bool' },
      { name: 'currentCenterX', type: 'uint16' },
      { name: 'currentCenterY', type: 'uint16' },
      { name: 'currentRadius', type: 'uint16' },
      { name: 'targetCenterX', type: 'uint16' },
      { name: 'targetCenterY', type: 'uint16' },
      { name: 'targetRadius', type: 'uint16' },
      { name: 'entropyHash', type: 'bytes32' },
      { name: 'timestamp', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'commitStormCircle',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_gameId', type: 'uint256' },
      { name: '_phase', type: 'uint8' },
    ],
    outputs: [],
  },
  {
    type: 'event',
    name: 'StormCircleCommitted',
    inputs: [
      { indexed: true, name: 'gameId', type: 'uint256' },
      { indexed: true, name: 'phase', type: 'uint8' },
      { indexed: false, name: 'currentCenterX', type: 'uint16' },
      { indexed: false, name: 'currentCenterY', type: 'uint16' },
      { indexed: false, name: 'currentRadius', type: 'uint16' },
      { indexed: false, name: 'targetCenterX', type: 'uint16' },
      { indexed: false, name: 'targetCenterY', type: 'uint16' },
      { indexed: false, name: 'targetRadius', type: 'uint16' },
      { indexed: false, name: 'entropyHash', type: 'bytes32' },
      { indexed: false, name: 'timestamp', type: 'uint256' },
    ],
  },
] as const

type StormCircleTuple = readonly [
  boolean,
  number | bigint,
  number | bigint,
  number | bigint,
  number | bigint,
  number | bigint,
  number | bigint,
  string,
  number | bigint,
]

interface StormCircleObject {
  committed: boolean
  currentCenterX: number | bigint
  currentCenterY: number | bigint
  currentRadius: number | bigint
  targetCenterX: number | bigint
  targetCenterY: number | bigint
  targetRadius: number | bigint
  entropyHash: string
  timestamp: number | bigint
}

type RawStormCircleRecord = StormCircleTuple | StormCircleObject

function normalizeStormCircleRecord(
  gameId: number,
  phase: number,
  raw: RawStormCircleRecord,
  txHash: string | null = null,
) {
  const tupleRecord: StormCircleTuple | null = Array.isArray(raw) ? (raw as StormCircleTuple) : null
  const objectRecord: StormCircleObject | null = tupleRecord ? null : (raw as StormCircleObject)
  const committed = Boolean(tupleRecord ? tupleRecord[0] : objectRecord?.committed)
  if (!committed) return null

  return {
    gameId,
    phase,
    currentCenterX: Number(tupleRecord ? tupleRecord[1] : objectRecord?.currentCenterX),
    currentCenterY: Number(tupleRecord ? tupleRecord[2] : objectRecord?.currentCenterY),
    currentRadius: Number(tupleRecord ? tupleRecord[3] : objectRecord?.currentRadius),
    targetCenterX: Number(tupleRecord ? tupleRecord[4] : objectRecord?.targetCenterX),
    targetCenterY: Number(tupleRecord ? tupleRecord[5] : objectRecord?.targetCenterY),
    targetRadius: Number(tupleRecord ? tupleRecord[6] : objectRecord?.targetRadius),
    entropyHash: String(tupleRecord ? tupleRecord[7] : objectRecord?.entropyHash),
    committedAt: Number(tupleRecord ? tupleRecord[8] : objectRecord?.timestamp),
    txHash,
  }
}

async function readExistingStormCommit(
  publicClient: any,
  contractAddress: any,
  gameId: number,
  phase: number,
) {
  const raw = await publicClient.readContract({
    address: contractAddress,
    abi: STORM_ABI,
    functionName: 'stormCircles',
    args: [BigInt(gameId), phase],
  }) as RawStormCircleRecord

  return normalizeStormCircleRecord(gameId, phase, raw)
}

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

      console.log(`[game] Submitted result for game #${Number(gameId)} on-chain: ${txHash}`)
    } catch (e: any) {
      console.error(`[game] Failed to submit on-chain: ${e.message}`)
      // Still record locally even if on-chain submission fails
    }
  } else {
    console.log(`[game] Recorded game #${Number(gameId)} locally (no orchestrator configured)`)
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

gameRouter.post('/storm', async (req, res) => {
  const store = (req as any).store as GameStore
  const publicClient = (req as any).publicClient
  const orchestratorClient = (req as any).orchestratorClient
  const contractAddress = (req as any).contractAddress

  const gameId = Number(req.body?.gameId)
  const phase = Number(req.body?.phase)

  if (!Number.isInteger(gameId) || gameId < 0) {
    return res.status(400).json({ error: 'Invalid gameId', reason: 'invalid_game_id' })
  }
  if (!Number.isInteger(phase) || phase < 0 || phase > 5) {
    return res.status(400).json({ error: 'Invalid phase', reason: 'invalid_phase' })
  }

  const match = store.getMatch(gameId)
  if (!match || match.status !== 'active') {
    return res.status(404).json({ error: 'Active match not found', reason: 'match_not_found' })
  }

  if (!orchestratorClient || String(contractAddress).toLowerCase() === '0x0000000000000000000000000000000000000000') {
    return res.status(503).json({ error: 'On-chain storm commits unavailable', reason: 'orchestrator_unavailable' })
  }

  try {
    const existingCommit = await readExistingStormCommit(publicClient, contractAddress, gameId, phase)
    if (existingCommit) {
      return res.json({
        success: true,
        txHash: null,
        commit: existingCommit,
      })
    }
  } catch {
    // Continue to the write path if the read fails.
  }

  try {
    const txHash = await orchestratorClient.writeContract({
      address: contractAddress,
      abi: STORM_ABI,
      functionName: 'commitStormCircle',
      args: [BigInt(gameId), phase],
    })

    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
      timeout: 90_000,
    })

    for (const log of receipt.logs ?? []) {
      try {
        const decoded = decodeEventLog({
          abi: STORM_ABI,
          data: log.data,
          topics: log.topics,
        })
        if (decoded.eventName !== 'StormCircleCommitted') continue

        const args = decoded.args as Record<string, unknown>
        return res.json({
          success: true,
          txHash,
          commit: {
            gameId: Number(args.gameId ?? gameId),
            phase: Number(args.phase ?? phase),
            currentCenterX: Number(args.currentCenterX ?? 0),
            currentCenterY: Number(args.currentCenterY ?? 0),
            currentRadius: Number(args.currentRadius ?? 0),
            targetCenterX: Number(args.targetCenterX ?? 0),
            targetCenterY: Number(args.targetCenterY ?? 0),
            targetRadius: Number(args.targetRadius ?? 0),
            entropyHash: String(args.entropyHash ?? ''),
            committedAt: Number(args.timestamp ?? 0),
            txHash,
          },
        })
      } catch {
        // Ignore unrelated logs in the same receipt.
      }
    }

    const existingCommit = await readExistingStormCommit(publicClient, contractAddress, gameId, phase)
    if (existingCommit) {
      return res.json({
        success: true,
        txHash,
        commit: { ...existingCommit, txHash },
      })
    }

    return res.status(502).json({
      error: 'Storm commit event missing from receipt',
      reason: 'event_missing',
      txHash,
    })
  } catch (error) {
    try {
      const existingCommit = await readExistingStormCommit(publicClient, contractAddress, gameId, phase)
      if (existingCommit) {
        return res.json({
          success: true,
          txHash: null,
          commit: existingCommit,
        })
      }
    } catch {
      // Ignore recovery read failures and return the write error below.
    }

    const message = error instanceof Error ? error.message : String(error)
    return res.status(500).json({
      error: 'Failed to commit storm circle',
      reason: 'tx_failed',
      details: message,
    })
  }
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
