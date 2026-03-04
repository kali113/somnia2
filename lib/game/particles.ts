// ── Particle System ─────────────────────────────────────────────────────────

import type { Camera } from './camera'
import { drawDamageNumber, drawElimEffect } from './sprites'

export interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  color: string
  size: number
  type: 'spark' | 'smoke' | 'blood'
}

export interface DamagePopup {
  x: number
  y: number
  damage: number
  isShield: boolean
  life: number
}

export interface ElimExplosion {
  x: number
  y: number
  progress: number
}

export interface ParticleSystem {
  particles: Particle[]
  damagePopups: DamagePopup[]
  elimExplosions: ElimExplosion[]
}

export function createParticleSystem(): ParticleSystem {
  return {
    particles: [],
    damagePopups: [],
    elimExplosions: [],
  }
}

// ── Emit Particles ──────────────────────────────────────────────────────────

export function emitSparks(ps: ParticleSystem, x: number, y: number, count: number, color = '#ffe066') {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2
    const speed = 50 + Math.random() * 150
    ps.particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.2 + Math.random() * 0.3,
      maxLife: 0.5,
      color,
      size: 2 + Math.random() * 2,
      type: 'spark',
    })
  }
}

export function emitHitMarker(ps: ParticleSystem, x: number, y: number, damage: number, isShield: boolean) {
  ps.damagePopups.push({
    x: x + (Math.random() - 0.5) * 10,
    y: y - 10,
    damage,
    isShield,
    life: 1.0,
  })
  emitSparks(ps, x, y, 4, isShield ? '#4ca6ff' : '#ff4444')
}

export function emitElimination(ps: ParticleSystem, x: number, y: number) {
  ps.elimExplosions.push({ x, y, progress: 0 })
  emitSparks(ps, x, y, 12, '#ffe066')
}

// ── Update ──────────────────────────────────────────────────────────────────

export function updateParticles(ps: ParticleSystem, dt: number) {
  // Particles
  for (let i = ps.particles.length - 1; i >= 0; i--) {
    const p = ps.particles[i]
    p.x += p.vx * dt
    p.y += p.vy * dt
    p.vy += 200 * dt  // gravity
    p.life -= dt
    if (p.life <= 0) {
      ps.particles.splice(i, 1)
    }
  }

  // Damage popups
  for (let i = ps.damagePopups.length - 1; i >= 0; i--) {
    const d = ps.damagePopups[i]
    d.y -= 40 * dt
    d.life -= dt
    if (d.life <= 0) {
      ps.damagePopups.splice(i, 1)
    }
  }

  // Elim explosions
  for (let i = ps.elimExplosions.length - 1; i >= 0; i--) {
    const e = ps.elimExplosions[i]
    e.progress += dt * 2
    if (e.progress >= 1) {
      ps.elimExplosions.splice(i, 1)
    }
  }
}

// ── Render ──────────────────────────────────────────────────────────────────

export function renderParticles(ctx: CanvasRenderingContext2D, ps: ParticleSystem, cam: Camera) {
  // Sparks
  for (const p of ps.particles) {
    const sx = p.x - cam.x
    const sy = p.y - cam.y
    if (sx < -10 || sx > cam.width + 10 || sy < -10 || sy > cam.height + 10) continue
    ctx.globalAlpha = p.life / p.maxLife
    ctx.fillStyle = p.color
    ctx.fillRect(sx - p.size / 2, sy - p.size / 2, p.size, p.size)
  }
  ctx.globalAlpha = 1

  // Damage popups
  for (const d of ps.damagePopups) {
    const sx = d.x - cam.x
    const sy = d.y - cam.y
    if (sx < -50 || sx > cam.width + 50 || sy < -50 || sy > cam.height + 50) continue
    drawDamageNumber(ctx, sx, sy, d.damage, d.isShield, d.life)
  }

  // Elim explosions
  for (const e of ps.elimExplosions) {
    const sx = e.x - cam.x
    const sy = e.y - cam.y
    if (sx < -60 || sx > cam.width + 60 || sy < -60 || sy > cam.height + 60) continue
    drawElimEffect(ctx, sx, sy, e.progress)
  }
}
