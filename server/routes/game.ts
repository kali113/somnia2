import { timingSafeEqual } from 'node:crypto'
import { Router, type Request, type Response } from 'express'
import rateLimit from 'express-rate-limit'
import { decodeEventLog, isAddress } from 'viem'
import type { GameStore } from '../store.js'

export const gameRouter = Router()
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
const privilegedWriteLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
})

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

function hasPrivilegedAccess(req: Request): boolean {
  const expectedToken = String(req.app.locals.orchestratorApiToken || '').trim()
  if (!expectedToken) return false

  const authorizationHeader = req.header('authorization') || ''
  let bearerToken = ''
  if (authorizationHeader.slice(0, 6).toLowerCase() === 'bearer') {
    let whitespaceIndex = 6
    while (
      whitespaceIndex < authorizationHeader.length
      && (authorizationHeader[whitespaceIndex] === ' ' || authorizationHeader[whitespaceIndex] === '\t')
    ) {
      whitespaceIndex += 1
    }

    if (whitespaceIndex > 6) {
      bearerToken = authorizationHeader.slice(whitespaceIndex).trim()
    }
  }

  const presentedToken = String(req.header('x-orchestrator-token') || bearerToken || '').trim()
  if (!presentedToken) return false

  const expectedBuffer = Buffer.from(expectedToken, 'utf8')
  const presentedBuffer = Buffer.from(presentedToken, 'utf8')
  if (expectedBuffer.length !== presentedBuffer.length) {
    return false
  }

  return timingSafeEqual(expectedBuffer, presentedBuffer)
}

function rejectPrivilegedAccess(res: Response): Response {
  return res.status(403).json({
    error: 'Forbidden',
    reason: 'privileged_access_required',
  })
}

function normalizePlacements(rawPlacements: unknown): string[] | null {
  if (!Array.isArray(rawPlacements) || rawPlacements.length < 2 || rawPlacements.length > 20) {
    return null
  }

  const seen = new Set<string>()
  const placements: string[] = []
  for (const entry of rawPlacements) {
    if (typeof entry !== 'string' || !isAddress(entry)) {
      return null
    }

    const address = entry.toLowerCase()
    if (seen.has(address)) {
      return null
    }

    seen.add(address)
    placements.push(address)
  }

  return placements
}

function normalizeKills(rawKills: unknown, expectedLength: number): number[] | null {
  if (!Array.isArray(rawKills) || rawKills.length !== expectedLength) {
    return null
  }

  const kills: number[] = []
  for (const value of rawKills) {
    const parsed = typeof value === 'number' ? value : Number(value)
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 1000) {
      return null
    }
    kills.push(parsed)
  }

  return kills
}

/**
 * POST /api/game/result
 * Submit a validated game result from a privileged orchestrator caller.
 */
gameRouter.post('/result', privilegedWriteLimiter, async (req, res) => {
  const store = (req as any).store as GameStore
  const orchestratorClient = (req as any).orchestratorClient
  const contractAddress = (req as any).contractAddress

  if (!hasPrivilegedAccess(req)) {
    return rejectPrivilegedAccess(res)
  }

  const { placements: rawPlacements, kills: rawKills, gameId: rawGameId } = req.body as {
    placements?: unknown
    kills?: unknown
    gameId?: unknown
  }

  const gameId = Number(rawGameId)
  if (!Number.isInteger(gameId) || gameId < 0) {
    return res.status(400).json({ error: 'Invalid gameId', reason: 'invalid_game_id' })
  }

  const placements = normalizePlacements(rawPlacements)
  if (!placements) {
    return res.status(400).json({ error: 'Invalid placements array', reason: 'invalid_placements' })
  }

  const kills = normalizeKills(rawKills, placements.length)
  if (!kills) {
    return res.status(400).json({ error: 'Kills array must match placements length', reason: 'invalid_kills' })
  }

  const match = store.getMatch(gameId)
  if (!match || match.status !== 'active') {
    return res.status(404).json({ error: 'Active match not found', reason: 'match_not_found' })
  }

  if (match.players.length !== placements.length) {
    return res.status(400).json({ error: 'Placements do not match the active match roster', reason: 'roster_mismatch' })
  }

  const roster = new Set(match.players.map((player) => player.toLowerCase()))
  if (placements.some((player) => !roster.has(player))) {
    return res.status(400).json({ error: 'Placements include players outside the active match', reason: 'roster_mismatch' })
  }

  if (!orchestratorClient || String(contractAddress).toLowerCase() === ZERO_ADDRESS) {
    return res.status(503).json({ error: 'On-chain result submission unavailable', reason: 'orchestrator_unavailable' })
  }

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
    }] as const

    const txHash = await orchestratorClient.writeContract({
      address: contractAddress,
      abi,
      functionName: 'submitGameResult',
      args: [BigInt(gameId), placements, kills.map((value) => BigInt(value))],
    })

    console.log(`[game] Submitted result for game #${gameId} on-chain: ${txHash}`)
    return res.json({ success: true, gameId, txHash })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[game] Failed to submit result for game #${gameId}: ${message}`)
    return res.status(500).json({
      error: 'Failed to submit game result',
      reason: 'tx_failed',
    })
  }
})

gameRouter.post('/storm', privilegedWriteLimiter, async (req, res) => {
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

  if (!hasPrivilegedAccess(req)) {
    return rejectPrivilegedAccess(res)
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
    console.error(`[game] Failed to commit storm circle for game #${gameId}, phase ${phase}: ${message}`)
    return res.status(500).json({
      error: 'Failed to commit storm circle',
      reason: 'tx_failed',
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
