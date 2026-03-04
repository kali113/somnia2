'use client'

import { useReadContract } from 'wagmi'
import { useAccount } from 'wagmi'
import { getRecentGamesArgs, truncateAddress } from '@/lib/somnia/contract'
import { Crown, Medal } from 'lucide-react'
import { useMemo } from 'react'

interface LeaderboardEntry {
  address: string
  wins: number
  gamesPlayed: number
}

export default function Leaderboard() {
  const { address } = useAccount()

  const { data: recentGames } = useReadContract({
    ...getRecentGamesArgs(50n),
    query: { refetchInterval: 30000 },
  })

  // Build leaderboard from game results
  const leaderboard = useMemo(() => {
    const games = (recentGames as any[]) ?? []
    const map = new Map<string, LeaderboardEntry>()

    for (const game of games) {
      const winner = ((game.winner ?? game[2] ?? '') as string).toLowerCase()
      const placements = (game.placements ?? game[3] ?? []) as string[]

      for (const player of placements) {
        const addr = player.toLowerCase()
        const existing = map.get(addr) || { address: player, wins: 0, gamesPlayed: 0 }
        existing.gamesPlayed++
        if (addr === winner) existing.wins++
        map.set(addr, existing)
      }
    }

    return Array.from(map.values())
      .sort((a, b) => b.wins - a.wins || b.gamesPlayed - a.gamesPlayed)
      .slice(0, 10)
  }, [recentGames])

  const medalColors = ['#ffd700', '#c0c0c0', '#cd7f32']

  return (
    <div className="rounded-xl border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] p-6">
      <div className="flex items-center gap-2 mb-4">
        <Crown className="h-4 w-4 text-[#ffd700]" />
        <h3 className="font-mono font-bold text-white text-sm">Leaderboard</h3>
      </div>

      {leaderboard.length === 0 ? (
        <div className="text-center py-6">
          <Medal className="h-8 w-8 text-[rgba(255,255,255,0.15)] mx-auto mb-2" />
          <p className="text-xs font-mono text-[rgba(255,255,255,0.3)]">
            No games played yet. Be the first!
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {leaderboard.map((entry, i) => {
            const isYou = entry.address.toLowerCase() === address?.toLowerCase()
            return (
              <div
                key={entry.address}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 ${
                  isYou
                    ? 'bg-[rgba(58,232,255,0.08)] border border-[rgba(58,232,255,0.15)]'
                    : 'bg-[rgba(0,0,0,0.2)]'
                }`}
              >
                <span
                  className="text-sm font-mono font-bold w-6 text-center"
                  style={{ color: i < 3 ? medalColors[i] : 'rgba(255,255,255,0.3)' }}
                >
                  {i + 1}
                </span>
                <span className={`text-xs font-mono flex-1 ${isYou ? 'text-[#3ae8ff]' : 'text-[rgba(255,255,255,0.6)]'}`}>
                  {truncateAddress(entry.address)}
                  {isYou && <span className="text-[10px] text-[#3ae8ff] ml-1">(you)</span>}
                </span>
                <div className="text-right">
                  <span className="text-xs font-mono font-bold text-[#ffd700]">{entry.wins}W</span>
                  <span className="text-[10px] font-mono text-[rgba(255,255,255,0.3)] ml-1">
                    {entry.gamesPlayed}G
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
