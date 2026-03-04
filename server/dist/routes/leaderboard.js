import { Router } from 'express';
export const leaderboardRouter = Router();
/**
 * GET /api/leaderboard
 * Returns the global leaderboard sorted by wins (default), kills, or earned.
 */
leaderboardRouter.get('/', (req, res) => {
    const store = req.store;
    const sortBy = req.query.sort || 'wins';
    const limit = parseInt(req.query.limit) || 20;
    const leaderboard = store.getLeaderboard(sortBy, limit);
    res.json({ leaderboard });
});
