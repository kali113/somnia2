import { Router } from 'express'
import type { GameStore } from '../store.js'

export const queueRouter = Router()

/**
 * GET /api/queue/status
 * Returns current queue state.
 */
queueRouter.get('/status', (req, res) => {
  const store = (req as any).store as GameStore
  res.json(store.getQueueState())
})

/**
 * POST /api/queue/join
 * Add a player to the server-side queue tracking.
 * Note: The actual on-chain queue join is done by the frontend directly.
 * This endpoint syncs the backend's view.
 */
queueRouter.post('/join', (req, res) => {
  const store = (req as any).store as GameStore
  const { address } = req.body

  if (!address || !address.startsWith('0x')) {
    return res.status(400).json({ error: 'Invalid address' })
  }

  const added = store.addToQueue(address)
  if (!added) {
    return res.status(409).json({ error: 'Already in queue or queue full' })
  }

  // Broadcast via WebSocket
  const broadcast = (req.app as any).broadcastQueueUpdate
  if (broadcast) broadcast()

  res.json({ success: true, queue: store.getQueueState() })
})

/**
 * POST /api/queue/leave
 * Remove a player from the server-side queue tracking.
 */
queueRouter.post('/leave', (req, res) => {
  const store = (req as any).store as GameStore
  const { address } = req.body

  if (!address || !address.startsWith('0x')) {
    return res.status(400).json({ error: 'Invalid address' })
  }

  const removed = store.removeFromQueue(address)
  if (!removed) {
    return res.status(404).json({ error: 'Not in queue' })
  }

  const broadcast = (req.app as any).broadcastQueueUpdate
  if (broadcast) broadcast()

  res.json({ success: true, queue: store.getQueueState() })
})
