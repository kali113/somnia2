// ── Storm Circle ────────────────────────────────────────────────────────────

import { STORM_PHASES, MAP_WIDTH, MAP_HEIGHT, COLORS } from './constants'
import type { Camera } from './camera'

export interface StormState {
  phase: number
  centerX: number
  centerY: number
  currentRadius: number
  targetCenterX: number
  targetCenterY: number
  targetRadius: number
  timer: number            // seconds remaining in current sub-phase
  shrinking: boolean
  damagePerTick: number
  tickTimer: number
}

export function createStorm(): StormState {
  return {
    phase: 0,
    centerX: MAP_WIDTH / 2,
    centerY: MAP_HEIGHT / 2,
    currentRadius: MAP_WIDTH * 0.7,
    targetCenterX: MAP_WIDTH / 2,
    targetCenterY: MAP_HEIGHT / 2,
    targetRadius: MAP_WIDTH * 0.7,
    timer: STORM_PHASES[0].waitTime,
    shrinking: false,
    damagePerTick: STORM_PHASES[0].damagePerTick,
    tickTimer: 0,
  }
}

export function updateStorm(storm: StormState, dt: number): boolean {
  storm.timer -= dt
  storm.tickTimer += dt

  if (storm.timer <= 0) {
    if (!storm.shrinking) {
      // Start shrinking
      storm.shrinking = true
      const phaseDef = STORM_PHASES[storm.phase]
      storm.targetRadius = phaseDef.endRadius
      // Shift center slightly
      const shift = storm.currentRadius * 0.15
      storm.targetCenterX = storm.centerX + (Math.random() - 0.5) * shift
      storm.targetCenterY = storm.centerY + (Math.random() - 0.5) * shift
      // Clamp to map
      storm.targetCenterX = Math.max(storm.targetRadius, Math.min(MAP_WIDTH - storm.targetRadius, storm.targetCenterX))
      storm.targetCenterY = Math.max(storm.targetRadius, Math.min(MAP_HEIGHT - storm.targetRadius, storm.targetCenterY))
      storm.timer = phaseDef.shrinkTime
    } else {
      // Move to next phase
      storm.shrinking = false
      storm.phase++
      if (storm.phase >= STORM_PHASES.length) {
        storm.phase = STORM_PHASES.length - 1
        storm.currentRadius = 0
        return true // game over
      }
      storm.damagePerTick = STORM_PHASES[storm.phase].damagePerTick
      storm.timer = STORM_PHASES[storm.phase].waitTime
    }
  }

  // Interpolate during shrinking
  if (storm.shrinking) {
    const phaseDef = STORM_PHASES[storm.phase]
    const progress = 1 - (storm.timer / phaseDef.shrinkTime)
    const startRadius = storm.phase > 0
      ? STORM_PHASES[storm.phase - 1].endRadius
      : MAP_WIDTH * 0.7

    storm.currentRadius = startRadius + (storm.targetRadius - startRadius) * progress
    storm.centerX += (storm.targetCenterX - storm.centerX) * dt * 0.5
    storm.centerY += (storm.targetCenterY - storm.centerY) * dt * 0.5
  }

  return false
}

export function isInStorm(storm: StormState, x: number, y: number): boolean {
  const dx = x - storm.centerX
  const dy = y - storm.centerY
  return dx * dx + dy * dy > storm.currentRadius * storm.currentRadius
}

export function renderStorm(ctx: CanvasRenderingContext2D, storm: StormState, cam: Camera, time: number) {
  const cx = storm.centerX - cam.x
  const cy = storm.centerY - cam.y
  const r = storm.currentRadius

  // Draw storm outside circle using a large rect with a circle cut out
  ctx.save()
  ctx.beginPath()
  ctx.rect(-10, -10, cam.width + 20, cam.height + 20)
  ctx.arc(cx, cy, r, 0, Math.PI * 2, true)
  ctx.closePath()

  // Animated storm fill
  const pulse = Math.sin(time * 2) * 0.05 + 0.25
  ctx.fillStyle = `rgba(123, 45, 255, ${pulse})`
  ctx.fill()

  // Storm edge glow
  ctx.strokeStyle = COLORS.stormEdge
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.stroke()

  // Moving target circle (next safe zone)
  if (storm.shrinking) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)'
    ctx.lineWidth = 1
    ctx.setLineDash([8, 8])
    ctx.beginPath()
    ctx.arc(
      storm.targetCenterX - cam.x,
      storm.targetCenterY - cam.y,
      storm.targetRadius, 0, Math.PI * 2,
    )
    ctx.stroke()
    ctx.setLineDash([])
  }

  ctx.restore()
}

// ── Minimap Storm ───────────────────────────────────────────────────────────

export function renderStormMinimap(
  ctx: CanvasRenderingContext2D,
  storm: StormState,
  mx: number, my: number, mSize: number,
) {
  const scale = mSize / MAP_WIDTH
  const cx = mx + storm.centerX * scale
  const cy = my + storm.centerY * scale
  const r = storm.currentRadius * scale

  ctx.strokeStyle = COLORS.stormEdge
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.stroke()
}
