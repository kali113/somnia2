import { Router, type Router as ExpressRouter } from 'express'
import type { GameStore } from '../store.js'

export const playerRouter: ExpressRouter = Router()

/**
 * GET /api/player/:address/stats
 * Returns player stats from the in-memory store.
 */
playerRouter.get('/:address/stats', (req, res) => {
  const store = (req as any).store as GameStore
  const { address } = req.params

  if (!address || !address.startsWith('0x')) {
    return res.status(400).json({ error: 'Invalid address' })
  }

  const player = store.getPlayer(address)
  if (!player) {
    return res.json({
      address: address.toLowerCase(),
      gamesPlayed: 0,
      wins: 0,
      kills: 0,
      deaths: 0,
      totalEarned: '0',
      matchHistory: [],
    })
  }

  res.json(player)
})

/**
 * GET /api/player/:address/history
 * Returns recent match history for a player.
 */
playerRouter.get('/:address/history', (req, res) => {
  const store = (req as any).store as GameStore
  const { address } = req.params
  const limit = parseInt(req.query.limit as string) || 20

  if (!address || !address.startsWith('0x')) {
    return res.status(400).json({ error: 'Invalid address' })
  }

  const player = store.getPlayer(address)
  if (!player) {
    return res.json({ games: [] })
  }

  const gameIds = player.matchHistory.slice(-limit).reverse()
  const games = gameIds.map(id => store.getGame(id)).filter(Boolean)

  res.json({ games })
})
