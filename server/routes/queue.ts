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
