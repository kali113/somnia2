import { Router, type Router as ExpressRouter } from 'express'
import type { GameStore } from '../store.js'

export const matchmakingRouter: ExpressRouter = Router()

function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address)
}

matchmakingRouter.get('/queue', (req, res) => {
  const store = (req as any).store as GameStore
  res.json(store.getQueueState())
})

matchmakingRouter.get('/me/:address', (req, res) => {
  const store = (req as any).store as GameStore
  const address = req.params.address?.toLowerCase()

  if (!address || !isValidAddress(address)) {
    return res.status(400).json({ error: 'Invalid address' })
  }

  const match = store.getMatchForPlayer(address)
  if (match && match.status === 'active') {
    return res.json({
      address,
      status: 'matched',
      matchId: match.matchId,
      redirectPath: `/game?matchId=${match.matchId}`,
      match,
    })
  }

  const queue = store.getQueueState()
  const queuePosition = queue.players.findIndex((p) => p === address)

  if (queuePosition >= 0) {
    return res.json({
      address,
      status: 'queued',
      queuePosition: queuePosition + 1,
      queue,
    })
  }

  return res.json({
    address,
    status: 'idle',
  })
})

matchmakingRouter.get('/matches/:matchId', (req, res) => {
  const store = (req as any).store as GameStore
  const matchId = Number(req.params.matchId)

  if (!Number.isFinite(matchId) || matchId < 0) {
    return res.status(400).json({ error: 'Invalid matchId' })
  }

  const match = store.getMatch(matchId)
  if (!match) {
    return res.status(404).json({ error: 'Match not found' })
  }

  res.json({ match })
})
