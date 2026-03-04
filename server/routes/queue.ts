import { Router, type Router as ExpressRouter } from 'express'
import type { GameStore } from '../store.js'

export const queueRouter: ExpressRouter = Router()

/**
 * GET /api/queue/status
 * Returns current on-chain mirrored queue state.
 */
queueRouter.get('/status', (_req, res) => {
  const store = (_req as any).store as GameStore
  res.json(store.getQueueState())
})

/**
 * POST /api/queue/join
 * Deprecated: queue mutations are on-chain only via joinQueue().
 */
queueRouter.post('/join', (_req, res) => {
  return res.status(410).json({
    error: 'Queue mutations moved on-chain. Use contract joinQueue() from the frontend.',
  })
})

/**
 * POST /api/queue/leave
 * Deprecated: queue mutations are on-chain only via leaveQueue().
 */
queueRouter.post('/leave', (_req, res) => {
  return res.status(410).json({
    error: 'Queue mutations moved on-chain. Use contract leaveQueue() from the frontend.',
  })
})

/**
 * POST /api/queue/mode
 * Set a player's preferred game mode (solo | duo | squad).
 * Body: { address: string, mode: 'solo' | 'duo' | 'squad' }
 */
queueRouter.post('/mode', (req, res) => {
  const store = (req as any).store as GameStore
  const { address, mode } = req.body as { address?: string; mode?: string }

  if (!address || typeof address !== 'string') {
    return res.status(400).json({ error: 'address is required' })
  }

  if (mode !== 'solo' && mode !== 'duo' && mode !== 'squad') {
    return res.status(400).json({ error: 'mode must be solo, duo, or squad' })
  }

  store.setPlayerMode(address, mode)
  return res.json({ ok: true, address: address.toLowerCase(), mode })
})
