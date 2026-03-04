import { Router } from 'express'
import type { GameStore } from '../store.js'

export const leaderboardRouter = Router()

/**
 * GET /api/leaderboard
 * Returns the global leaderboard sorted by wins (default), kills, or earned.
 */
leaderboardRouter.get('/', (req, res) => {
  const store = (req as any).store as GameStore
  const sortBy = (req.query.sort as 'wins' | 'kills' | 'earned') || 'wins'
  const limit = parseInt(req.query.limit as string) || 20

  const leaderboard = store.getLeaderboard(sortBy, limit)
  res.json({ leaderboard })
})
