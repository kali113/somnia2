'use client'

import { useAccount, useReadContract } from 'wagmi'
import { getPlayerStatsArgs, formatSTT } from '@/lib/somnia/contract'
import { Trophy, Crosshair, Gamepad2, TrendingUp } from 'lucide-react'

export default function StatsPanel() {
  const { address } = useAccount()

  const { data: rawStats } = useReadContract({
    ...getPlayerStatsArgs(address ?? '0x0000000000000000000000000000000000000000'),
    query: { enabled: !!address, refetchInterval: 15000 },
  })

  const stats = rawStats as any

  const gamesPlayed = stats ? Number(stats.gamesPlayed ?? stats[0] ?? 0n) : 0
  const wins = stats ? Number(stats.wins ?? stats[1] ?? 0n) : 0
  const kills = stats ? Number(stats.kills ?? stats[2] ?? 0n) : 0
  const earned = stats ? (stats.totalEarned ?? stats[3] ?? 0n) : 0n
  const winRate = gamesPlayed > 0 ? ((wins / gamesPlayed) * 100).toFixed(1) : '0.0'
  const kd = gamesPlayed > 0 ? (kills / Math.max(1, gamesPlayed - wins)).toFixed(2) : '0.00'

  const statItems = [
    {
      label: 'Games Played',
      value: gamesPlayed.toString(),
      icon: <Gamepad2 className="h-4 w-4" />,
      color: '#3ae8ff',
    },
    {
      label: 'Wins',
      value: wins.toString(),
      icon: <Trophy className="h-4 w-4" />,
      color: '#ffd700',
    },
    {
      label: 'K/D Ratio',
      value: kd,
      icon: <Crosshair className="h-4 w-4" />,
      color: '#ff4444',
    },
    {
      label: 'Win Rate',
      value: `${winRate}%`,
      icon: <TrendingUp className="h-4 w-4" />,
      color: '#4cff4c',
    },
    {
      label: 'Total Kills',
      value: kills.toString(),
      icon: <Crosshair className="h-4 w-4" />,
      color: '#ff8c00',
    },
    {
      label: 'STT Earned',
      value: typeof earned === 'bigint' ? formatSTT(earned) : '0',
      icon: <TrendingUp className="h-4 w-4" />,
      color: '#7b2dff',
    },
  ]

  if (!address) {
    return (
      <div className="rounded-xl border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] p-6">
        <h3 className="font-mono font-bold text-white text-sm mb-4">Player Stats</h3>
        <p className="text-xs font-mono text-[rgba(255,255,255,0.3)] text-center py-4">
          Connect wallet to view stats
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] p-6">
      <h3 className="font-mono font-bold text-white text-sm mb-4">Player Stats</h3>
      <div className="grid grid-cols-2 gap-3">
        {statItems.map((item) => (
          <div
            key={item.label}
            className="rounded-lg bg-[rgba(0,0,0,0.3)] p-3"
          >
            <div className="flex items-center gap-1.5 mb-1">
              <span style={{ color: item.color }}>{item.icon}</span>
              <span className="text-[10px] font-mono text-[rgba(255,255,255,0.4)] uppercase">
                {item.label}
              </span>
            </div>
            <p className="text-lg font-mono font-bold text-white">{item.value}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
