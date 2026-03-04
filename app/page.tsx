'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Crosshair, Zap, Shield, Swords, Cloud, Users, ChevronRight } from 'lucide-react'

// Animated pixel art background canvas
function PixelBackground() {
  useEffect(() => {
    const canvas = document.getElementById('bg-canvas') as HTMLCanvasElement
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animFrame = 0
    const particles: { x: number; y: number; vx: number; vy: number; size: number; color: string; life: number }[] = []

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    const colors = ['#3ae8ff', '#7b2dff', '#ffd700', '#4cff4c']

    function addParticle() {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.5,
        vy: -0.2 - Math.random() * 0.3,
        size: 2 + Math.random() * 3,
        color: colors[Math.floor(Math.random() * colors.length)],
        life: 200 + Math.random() * 300,
      })
    }

    function draw() {
      if (!ctx) return
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // Grid lines
      ctx.strokeStyle = 'rgba(58, 232, 255, 0.03)'
      ctx.lineWidth = 1
      const gridSize = 48
      for (let x = 0; x < canvas.width; x += gridSize) {
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, canvas.height)
        ctx.stroke()
      }
      for (let y = 0; y < canvas.height; y += gridSize) {
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(canvas.width, y)
        ctx.stroke()
      }

      // Particles
      if (Math.random() < 0.15) addParticle()

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]
        p.x += p.vx
        p.y += p.vy
        p.life--

        if (p.life <= 0 || p.y < -10) {
          particles.splice(i, 1)
          continue
        }

        const alpha = Math.min(1, p.life / 100)
        ctx.globalAlpha = alpha * 0.6
        ctx.fillStyle = p.color
        ctx.fillRect(
          Math.floor(p.x / 2) * 2,
          Math.floor(p.y / 2) * 2,
          p.size,
          p.size,
        )
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
      id="bg-canvas"
      className="fixed inset-0 z-0"
      style={{ imageRendering: 'pixelated' }}
    />
  )
}

// Fake lobby players
const LOBBY_PLAYERS = [
  'ShadowSniper', 'PixelProwler', 'NeonNinja', 'BlazeMaster',
  'CyberSamurai', 'GhostReaper', 'FrostByte', 'ThunderStrike',
  'VortexKing', 'DarkPhoenix', 'CrimsonBlade', 'SilverArrow',
]

export default function HomePage() {
  const [lobbyCount, setLobbyCount] = useState(18)
  const [showPlayers, setShowPlayers] = useState(false)

  useEffect(() => {
    const interval = setInterval(() => {
      setLobbyCount(prev => {
        const delta = Math.random() > 0.5 ? 1 : -1
        return Math.max(12, Math.min(25, prev + delta))
      })
    }, 3000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#050508]">
      <PixelBackground />

      {/* Radial glow */}
      <div
        className="fixed inset-0 z-0"
        style={{
          background: 'radial-gradient(ellipse at 50% 30%, rgba(58,232,255,0.06) 0%, transparent 60%)',
        }}
      />

      <div className="relative z-10">
        {/* Header */}
        <header className="flex items-center justify-between px-6 py-4 lg:px-12">
          <div className="flex items-center gap-2">
            <Crosshair className="h-5 w-5 text-[#3ae8ff]" />
            <span className="text-sm font-mono font-bold text-[rgba(255,255,255,0.7)]">PIXEL ROYALE</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-[#4cff4c]" style={{ boxShadow: '0 0 6px #4cff4c' }} />
              <span className="text-xs font-mono text-[rgba(255,255,255,0.5)]">
                {lobbyCount} players online
              </span>
            </div>
            <div className="hidden sm:flex items-center gap-1.5 rounded-lg bg-[rgba(123,45,255,0.15)] px-3 py-1 border border-[rgba(123,45,255,0.3)]">
              <span className="text-xs font-mono text-[rgba(123,45,255,0.9)]">Somnia Testnet</span>
            </div>
          </div>
        </header>

        {/* Hero */}
        <main className="flex flex-col items-center px-6 pt-12 pb-20 lg:pt-24">
          {/* Title */}
          <div className="text-center mb-12">
            <h1 className="text-6xl md:text-8xl lg:text-9xl font-black tracking-tighter text-balance">
              <span className="text-[#3ae8ff]" style={{ textShadow: '0 0 40px rgba(58,232,255,0.3)' }}>
                PIXEL
              </span>
              <br />
              <span className="text-white" style={{ textShadow: '0 0 30px rgba(255,255,255,0.1)' }}>
                ROYALE
              </span>
            </h1>
            <p className="mt-4 max-w-md mx-auto text-sm md:text-base font-mono text-[rgba(255,255,255,0.4)] leading-relaxed text-pretty">
              A 2D pixel-art battle royale powered by Somnia blockchain reactivity.
              Drop in, loot up, and be the last one standing.
            </p>
          </div>

          {/* Play Button */}
          <Link
            href="/game"
            className="group relative mb-16"
          >
            <div className="absolute -inset-1 rounded-2xl bg-[#3ae8ff] opacity-20 blur-lg group-hover:opacity-40 transition-opacity" />
            <div className="relative flex items-center gap-3 rounded-2xl bg-[#3ae8ff] px-12 py-4 font-mono font-black text-lg text-[#050508] transition-all hover:scale-105 active:scale-95">
              PLAY NOW
              <ChevronRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
            </div>
          </Link>

          {/* Features Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl w-full">
            <FeatureCard
              icon={<Swords className="h-5 w-5" />}
              title="Battle Royale"
              description="25 players drop onto a pixel-art island. Loot weapons, build cover, survive the storm."
              color="#ff4444"
            />
            <FeatureCard
              icon={<Zap className="h-5 w-5" />}
              title="Somnia Reactivity"
              description="On-chain events trigger supply drops and game events in real-time via WebSocket subscriptions."
              color="#3ae8ff"
            />
            <FeatureCard
              icon={<Cloud className="h-5 w-5" />}
              title="Storm Circle"
              description="A shrinking storm circle forces players together. Stay inside the safe zone or take damage."
              color="#7b2dff"
            />
            <FeatureCard
              icon={<Shield className="h-5 w-5" />}
              title="Build & Defend"
              description="Harvest materials and build walls, ramps, and floors for cover during intense firefights."
              color="#ffd700"
            />
            <FeatureCard
              icon={<Crosshair className="h-5 w-5" />}
              title="5 Weapon Types"
              description="AR, Shotgun, SMG, Sniper, and Pickaxe. Each with rarity tiers from Common to Legendary."
              color="#4cff4c"
            />
            <FeatureCard
              icon={<Users className="h-5 w-5" />}
              title="Online Lobby"
              description="Multiplayer-ready architecture with live lobby, simulated opponents, and kill feed tracking."
              color="#ff8c00"
            />
          </div>

          {/* Somnia Section */}
          <div className="mt-16 max-w-2xl w-full">
            <div className="rounded-2xl border border-[rgba(123,45,255,0.2)] bg-[rgba(123,45,255,0.05)] p-6 md:p-8">
              <div className="flex items-start gap-4">
                <div className="rounded-xl bg-[rgba(123,45,255,0.15)] p-3">
                  <Zap className="h-6 w-6 text-[#7b2dff]" />
                </div>
                <div className="flex-1">
                  <h3 className="font-mono font-bold text-white text-lg mb-2">Powered by Somnia Reactivity</h3>
                  <p className="text-sm font-mono text-[rgba(255,255,255,0.5)] leading-relaxed mb-4">
                    This game uses Somnia&apos;s off-chain reactivity feature to push blockchain events directly
                    into gameplay. Smart contract events on Somnia Testnet (Chain ID: 50312) trigger in-game
                    supply drops, storm changes, and milestone rewards via WebSocket subscriptions.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-lg bg-[rgba(58,232,255,0.1)] px-3 py-1 text-xs font-mono text-[#3ae8ff] border border-[rgba(58,232,255,0.2)]">
                      Off-Chain Subscriptions
                    </span>
                    <span className="rounded-lg bg-[rgba(255,215,0,0.1)] px-3 py-1 text-xs font-mono text-[#ffd700] border border-[rgba(255,215,0,0.2)]">
                      Reactive Events
                    </span>
                    <span className="rounded-lg bg-[rgba(76,255,76,0.1)] px-3 py-1 text-xs font-mono text-[#4cff4c] border border-[rgba(76,255,76,0.2)]">
                      Testnet Ready
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="mt-12 max-w-md w-full">
            <h3 className="text-center font-mono font-bold text-[rgba(255,255,255,0.6)] text-sm mb-4">CONTROLS</h3>
            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              <ControlItem keys="W A S D" action="Move" />
              <ControlItem keys="Mouse" action="Aim & Shoot" />
              <ControlItem keys="1-5" action="Switch Slots" />
              <ControlItem keys="R" action="Reload" />
              <ControlItem keys="B / Q" action="Build Mode" />
              <ControlItem keys="Scroll" action="Cycle Weapons" />
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer className="relative z-10 flex items-center justify-center gap-4 py-6 text-[10px] font-mono text-[rgba(255,255,255,0.25)]">
          <span>Built with Next.js + Canvas API</span>
          <span>|</span>
          <span>Somnia Testnet (Chain 50312)</span>
        </footer>
      </div>
    </div>
  )
}

function FeatureCard({
  icon, title, description, color,
}: {
  icon: React.ReactNode
  title: string
  description: string
  color: string
}) {
  return (
    <div
      className="rounded-xl p-5 transition-all hover:scale-[1.02]"
      style={{
        backgroundColor: 'rgba(255,255,255,0.03)',
        border: `1px solid ${color}15`,
      }}
    >
      <div
        className="mb-3 inline-flex rounded-lg p-2"
        style={{ backgroundColor: color + '15', color }}
      >
        {icon}
      </div>
      <h3 className="font-mono font-bold text-white text-sm mb-1">{title}</h3>
      <p className="text-xs font-mono text-[rgba(255,255,255,0.4)] leading-relaxed">{description}</p>
    </div>
  )
}

function ControlItem({ keys, action }: { keys: string; action: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-[rgba(255,255,255,0.04)] px-3 py-2 border border-[rgba(255,255,255,0.06)]">
      <span className="text-[#3ae8ff]">{keys}</span>
      <span className="text-[rgba(255,255,255,0.5)]">{action}</span>
    </div>
  )
}
