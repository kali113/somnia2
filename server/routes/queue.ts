import { Router, type Router as ExpressRouter } from 'express'
import { getServerLocals } from '../http.js'

export const queueRouter: ExpressRouter = Router()

/**
 * GET /api/queue/status
 * Returns current on-chain mirrored queue state.
 */
queueRouter.get('/status', (_req, res) => {
  const { store } = getServerLocals(_req)
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
 * Deprecated: solo queue is fixed in the current release.
 */
queueRouter.post('/mode', (_req, res) => {
  return res.status(410).json({
    error: 'Queue mode preferences are disabled. Solo queue is the only supported mode.',
  })
})
