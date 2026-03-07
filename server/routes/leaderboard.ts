import { Router, type Router as ExpressRouter } from 'express'
import { getServerLocals } from '../http.js'

export const leaderboardRouter: ExpressRouter = Router()

/**
 * GET /api/leaderboard
 * Returns the global leaderboard sorted by wins (default), kills, or earned.
 */
leaderboardRouter.get('/', (req, res) => {
  const { store } = getServerLocals(req)
  const sortBy = (req.query.sort as 'wins' | 'kills' | 'earned') || 'wins'
  const limit = parseInt(req.query.limit as string) || 20

  const leaderboard = store.getLeaderboard(sortBy, limit)
  res.json({ leaderboard })
})
