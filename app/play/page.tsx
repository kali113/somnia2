'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useAccount } from '@/lib/wagmi-shim'
import WalletPanel from '@/components/dashboard/WalletPanel'
import QueuePanel from '@/components/dashboard/QueuePanel'
import StatsPanel from '@/components/dashboard/StatsPanel'
import MatchHistory from '@/components/dashboard/MatchHistory'
import Leaderboard from '@/components/dashboard/Leaderboard'
import RewardsPanel from '@/components/dashboard/RewardsPanel'
import SessionKeyPanel from '@/components/dashboard/SessionKeyPanel'
import {
  IS_PIXEL_ROYALE_CONFIGURED,
  PIXEL_ROYALE_ADDRESS,
  truncateAddress,
} from '@/lib/somnia/contract'
import {
  Crosshair,
  ArrowLeft,
  Zap,
  Gamepad2,
  AlertTriangle,
} from 'lucide-react'

// Subtle animated background particles (lighter than landing page)
function DashboardBackground() {
  useEffect(() => {
    const canvas = document.getElementById('dash-bg') as HTMLCanvasElement
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animFrame = 0
    const particles: { x: number; y: number; vy: number; size: number; alpha: number }[] = []

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    function draw() {
      if (!ctx) return
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // Subtle grid
      ctx.strokeStyle = 'rgba(58, 232, 255, 0.02)'
      ctx.lineWidth = 1
      for (let x = 0; x < canvas.width; x += 64) {
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, canvas.height)
        ctx.stroke()
      }
      for (let y = 0; y < canvas.height; y += 64) {
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(canvas.width, y)
        ctx.stroke()
      }

      if (Math.random() < 0.05) {
        particles.push({
          x: Math.random() * canvas.width,
          y: canvas.height + 5,
          vy: -0.2 - Math.random() * 0.3,
          size: 1 + Math.random() * 2,
          alpha: 0.2 + Math.random() * 0.3,
        })
      }

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]
        p.y += p.vy
        p.alpha -= 0.001
        if (p.alpha <= 0 || p.y < -10) {
          particles.splice(i, 1)
          continue
        }
        ctx.globalAlpha = p.alpha
        ctx.fillStyle = '#3ae8ff'
        ctx.fillRect(Math.floor(p.x), Math.floor(p.y), p.size, p.size)
      }
      ctx.globalAlpha = 1

      animFrame = requestAnimationFrame(draw)
    }

    draw()
    return () => {
      cancelAnimationFrame(animFrame)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <canvas
      id="dash-bg"
      className="fixed inset-0 z-0 pointer-events-none"
      style={{ imageRendering: 'pixelated' }}
    />
  )
}

export default function PlayPage() {
  const { isConnected } = useAccount()

  return (
    <div className="relative min-h-screen overflow-hidden">
      <DashboardBackground />

      {/* Radial glow */}
      <div
        className="fixed inset-0 z-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at 50% 0%, rgba(58,232,255,0.04) 0%, transparent 50%)',
        }}
      />

      <div className="relative z-10">
        {/* Header */}
        <header className="flex items-center justify-between px-4 py-4 lg:px-8 border-b border-[rgba(255,255,255,0.05)]">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="flex items-center gap-2 text-[rgba(255,255,255,0.4)] hover:text-white transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="text-xs font-mono hidden sm:inline">Back</span>
            </Link>
            <div className="h-4 w-px bg-[rgba(255,255,255,0.1)]" />
            <div className="flex items-center gap-2">
              <Crosshair className="h-5 w-5 text-[#3ae8ff]" />
              <span className="font-mono font-bold text-white text-sm">PIXEL ROYALE</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 rounded-lg bg-[rgba(123,45,255,0.15)] px-3 py-1 border border-[rgba(123,45,255,0.3)]">
              <Zap className="h-3 w-3 text-[#7b2dff]" />
              <span className="text-xs font-mono text-[rgba(123,45,255,0.9)]">Somnia Testnet</span>
            </div>
            {isConnected && (
              <div className="flex items-center gap-1.5">
                <div className="h-2 w-2 rounded-full bg-[#4cff4c]" style={{ boxShadow: '0 0 6px #4cff4c' }} />
                <span className="text-xs font-mono text-[rgba(255,255,255,0.5)]">Connected</span>
              </div>
            )}
          </div>
        </header>

        {/* Main Content */}
        <main className="mx-auto max-w-7xl px-4 py-6 lg:px-8 lg:py-8">
          {/* Welcome / Hero Banner */}
          <div className="rounded-2xl border border-[rgba(58,232,255,0.1)] bg-gradient-to-r from-[rgba(58,232,255,0.05)] to-[rgba(123,45,255,0.05)] p-6 lg:p-8 mb-6">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Gamepad2 className="h-5 w-5 text-[#3ae8ff]" />
                  <h1 className="font-mono font-black text-xl text-white">Battle Dashboard</h1>
                </div>
                <p className="text-sm font-mono text-[rgba(255,255,255,0.4)] max-w-lg">
                  Connect your wallet, join the queue, and compete for STT rewards.
                  Top 5 players earn from the prize pool. Games support up to 20 players.
                </p>
              </div>
              <Link
                href="/game"
                className="flex items-center justify-center gap-2 rounded-xl bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] px-6 py-3 font-mono text-xs text-[rgba(255,255,255,0.5)] hover:bg-[rgba(255,255,255,0.08)] hover:text-white transition-all"
              >
                <Gamepad2 className="h-4 w-4" />
                Practice Mode (Solo vs Bots)
              </Link>
            </div>

            {!IS_PIXEL_ROYALE_CONFIGURED && (
              <div className="mt-4 rounded-xl border border-[rgba(255,68,68,0.35)] bg-[rgba(255,68,68,0.12)] p-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="h-4 w-4 text-[#ff4444]" />
                  <p className="text-xs font-mono font-bold text-[#ff7b7b]">Contract not configured</p>
                </div>
                <p className="text-xs font-mono text-[rgba(255,255,255,0.75)]">
                  Testnet is currently unstable. Queue, rewards, and leaderboard are paused until we redeploy. Current value: {truncateAddress(PIXEL_ROYALE_ADDRESS, 6)}
                </p>
              </div>
            )}

          </div>

          {/* Grid Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column — Wallet + Session + Rewards */}
            <div className="lg:col-span-3 space-y-6">
              <WalletPanel />
              <SessionKeyPanel />
              <RewardsPanel />
            </div>

            {/* Center Column — Queue + Stats */}
            <div className="lg:col-span-5 space-y-6">
              <QueuePanel />
              <StatsPanel />
              <MatchHistory />
            </div>

            {/* Right Column — Leaderboard */}
            <div className="lg:col-span-4 space-y-6">
              <Leaderboard />

              {/* Game Info Card */}
              <div className="rounded-xl border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] p-6">
                <h3 className="font-mono font-bold text-white text-sm mb-3">How It Works</h3>
                <div className="space-y-3 text-xs font-mono text-[rgba(255,255,255,0.4)] leading-relaxed">
                  <div className="flex gap-3">
                    <span className="text-[#3ae8ff] font-bold shrink-0">1.</span>
                    <span>Connect your wallet and ensure you have STT for entry fees and gas.</span>
                  </div>
                  <div className="flex gap-3">
                    <span className="text-[#3ae8ff] font-bold shrink-0">2.</span>
                    <span>Create a session key so you don&apos;t sign every in-game action.</span>
                  </div>
                  <div className="flex gap-3">
                    <span className="text-[#3ae8ff] font-bold shrink-0">3.</span>
                    <span>Join the battle queue (0.001 STT entry). Game starts at 20 players or after timeout.</span>
                  </div>
                  <div className="flex gap-3">
                    <span className="text-[#3ae8ff] font-bold shrink-0">4.</span>
                    <span>Play the match! Remaining slots are filled with AI bots.</span>
                  </div>
                  <div className="flex gap-3">
                    <span className="text-[#3ae8ff] font-bold shrink-0">5.</span>
                    <span>Top 5 placements earn STT from the prize pool. Claim your rewards anytime.</span>
                  </div>
                </div>
              </div>

              {/* Somnia Speed Card */}
              <div className="rounded-xl border border-[rgba(123,45,255,0.15)] bg-[rgba(123,45,255,0.03)] p-6">
                <div className="flex items-center gap-2 mb-3">
                  <Zap className="h-4 w-4 text-[#7b2dff]" />
                  <h3 className="font-mono font-bold text-white text-sm">Why Somnia?</h3>
                </div>
                <p className="text-xs font-mono text-[rgba(255,255,255,0.4)] leading-relaxed mb-3">
                  Somnia&apos;s 400ms block times enable near-instant transaction confirmations,
                  making on-chain gaming feel seamless. Every queue join, session approval,
                  and reward claim settles in under a second.
                </p>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-md bg-[rgba(123,45,255,0.1)] px-2 py-1 text-[10px] font-mono text-[#7b2dff] border border-[rgba(123,45,255,0.2)]">
                    400ms Blocks
                  </span>
                  <span className="rounded-md bg-[rgba(123,45,255,0.1)] px-2 py-1 text-[10px] font-mono text-[#7b2dff] border border-[rgba(123,45,255,0.2)]">
                    400K+ TPS
                  </span>
                  <span className="rounded-md bg-[rgba(123,45,255,0.1)] px-2 py-1 text-[10px] font-mono text-[#7b2dff] border border-[rgba(123,45,255,0.2)]">
                    EVM Compatible
                  </span>
                </div>
              </div>
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer className="relative z-10 flex items-center justify-center gap-4 py-6 text-[10px] font-mono text-[rgba(255,255,255,0.2)] border-t border-[rgba(255,255,255,0.03)]">
          <span>Pixel Royale</span>
          <span>|</span>
          <span>Somnia Testnet (Chain 50312)</span>
          <span>|</span>
          <span>Somnia Hackathon 2026</span>
        </footer>
      </div>
    </div>
  )
}
