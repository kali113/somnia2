'use client'

import { useAccount, useReadContract } from 'wagmi'
import {
  getPlayerGameIdsArgs,
  getRecentGamesArgs,
  truncateAddress,
  formatSTT,
} from '@/lib/somnia/contract'
import { History, Trophy, Skull } from 'lucide-react'

export default function MatchHistory() {
  const { address } = useAccount()

  const { data: recentGames } = useReadContract({
    ...getRecentGamesArgs(20n),
    query: { refetchInterval: 30000 },
  })

  const games = (recentGames as any[]) ?? []

  if (!address) {
    return (
      <div className="rounded-xl border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] p-6">
        <h3 className="font-mono font-bold text-white text-sm mb-4">Match History</h3>
        <p className="text-xs font-mono text-[rgba(255,255,255,0.3)] text-center py-4">
          Connect wallet to view history
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] p-6">
      <div className="flex items-center gap-2 mb-4">
        <History className="h-4 w-4 text-[rgba(255,255,255,0.5)]" />
        <h3 className="font-mono font-bold text-white text-sm">Match History</h3>
      </div>

      {games.length === 0 ? (
        <div className="text-center py-8">
          <Skull className="h-8 w-8 text-[rgba(255,255,255,0.15)] mx-auto mb-2" />
          <p className="text-xs font-mono text-[rgba(255,255,255,0.3)]">
            No matches yet. Join the queue to play!
          </p>
        </div>
      ) : (
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {games.map((game: any, index: number) => {
            const gameId = Number(game.gameId ?? game[0] ?? 0n)
            const timestamp = Number(game.timestamp ?? game[1] ?? 0n)
            const winner = (game.winner ?? game[2] ?? '') as string
            const placements = (game.placements ?? game[3] ?? []) as string[]
            const prizePool = game.prizePool ?? game[4] ?? 0n
            const playerCount = Number(game.playerCount ?? game[5] ?? 0)
            const isWinner = winner.toLowerCase() === address.toLowerCase()
            const placement = placements.findIndex(
              (p: string) => p.toLowerCase() === address.toLowerCase()
            ) + 1
            const date = new Date(timestamp * 1000)

            return (
              <div
                key={`${gameId}-${index}`}
                className={`rounded-lg p-3 transition-colors ${
                  isWinner
                    ? 'bg-[rgba(255,215,0,0.08)] border border-[rgba(255,215,0,0.15)]'
                    : 'bg-[rgba(0,0,0,0.3)] border border-transparent'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {isWinner ? (
                      <Trophy className="h-4 w-4 text-[#ffd700]" />
                    ) : (
                      <Skull className="h-4 w-4 text-[rgba(255,255,255,0.3)]" />
                    )}
                    <div>
                      <span className="text-xs font-mono font-bold text-white">
                        Game #{gameId}
                      </span>
                      <span className="text-[10px] font-mono text-[rgba(255,255,255,0.3)] ml-2">
                        {date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span
                      className={`text-xs font-mono font-bold ${
                        isWinner
                          ? 'text-[#ffd700]'
                          : placement <= 5
                          ? 'text-[#3ae8ff]'
                          : 'text-[rgba(255,255,255,0.5)]'
                      }`}
                    >
                      #{placement || '?'}
                    </span>
                    <span className="text-[10px] font-mono text-[rgba(255,255,255,0.3)] ml-1">
                      /{playerCount}
                    </span>
                  </div>
                </div>
                {placement <= 5 && typeof prizePool === 'bigint' && prizePool > 0n && (
                  <div className="mt-1.5 text-[10px] font-mono text-[#4cff4c]">
                    +{formatSTT(prizePool)} STT pool
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
