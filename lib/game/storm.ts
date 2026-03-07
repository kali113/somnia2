// ── Storm Circle ────────────────────────────────────────────────────────────

import { STORM_PHASES, MAP_WIDTH, MAP_HEIGHT, COLORS } from './constants'
import type { Camera } from './camera'

export interface StormCommitRequest {
  phase: number
}

export interface StormCircleCommit {
  gameId: number
  phase: number
  currentCenterX: number
  currentCenterY: number
  currentRadius: number
  targetCenterX: number
  targetCenterY: number
  targetRadius: number
  entropyHash: string | null
  committedAt?: number | null
  txHash?: string | null
}

interface StormUpdateResult {
  gameOver: boolean
  commitRequest: StormCommitRequest | null
}

export interface StormState {
  phase: number
  seed: number
  verified: boolean
  centerX: number
  centerY: number
  currentRadius: number
  shrinkFromCenterX: number
  shrinkFromCenterY: number
  shrinkFromRadius: number
  targetCenterX: number
  targetCenterY: number
  targetRadius: number
  timer: number            // seconds remaining in current sub-phase
  shrinking: boolean
  pendingCommit: boolean
  requestedPhase: number | null
  entropyHash: string | null
  damagePerTick: number
  tickTimer: number
}

function clampStormCenter(value: number, targetRadius: number, mapSize: number): number {
  return Math.max(targetRadius, Math.min(mapSize - targetRadius, value))
}

function phaseSeed(seed: number, phase: number): number {
  return ((seed >>> 0) ^ Math.imul(phase + 1, 0x9e3779b1)) >>> 0
}

function createPhaseRng(seed: number) {
  let value = seed >>> 0
  return () => {
    value += 0x6d2b79f5
    let t = Math.imul(value ^ (value >>> 15), value | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function buildLocalStormCommit(storm: StormState, gameId = 0): StormCircleCommit {
  const phaseDef = STORM_PHASES[storm.phase]
  const rng = createPhaseRng(phaseSeed(storm.seed ^ Math.imul((gameId + 1) >>> 0, 0x45d9f3b), storm.phase))
  const shift = storm.currentRadius * 0.15
  const targetRadius = phaseDef.endRadius
  const targetCenterX = clampStormCenter(
    storm.centerX + (rng() - 0.5) * shift,
    targetRadius,
    MAP_WIDTH,
  )
  const targetCenterY = clampStormCenter(
    storm.centerY + (rng() - 0.5) * shift,
    targetRadius,
    MAP_HEIGHT,
  )

  return {
    gameId,
    phase: storm.phase,
    currentCenterX: storm.centerX,
    currentCenterY: storm.centerY,
    currentRadius: storm.currentRadius,
    targetCenterX,
    targetCenterY,
    targetRadius,
    entropyHash: `local-${storm.seed.toString(16)}-${storm.phase}`,
    committedAt: null,
    txHash: null,
  }
}

export function createStorm(options?: { seed?: number; verified?: boolean }): StormState {
  const initialRadius = MAP_WIDTH * 0.7
  return {
    phase: 0,
    seed: Math.max(1, Math.floor(options?.seed ?? 1)),
    verified: options?.verified ?? false,
    centerX: MAP_WIDTH / 2,
    centerY: MAP_HEIGHT / 2,
    currentRadius: initialRadius,
    shrinkFromCenterX: MAP_WIDTH / 2,
    shrinkFromCenterY: MAP_HEIGHT / 2,
    shrinkFromRadius: initialRadius,
    targetCenterX: MAP_WIDTH / 2,
    targetCenterY: MAP_HEIGHT / 2,
    targetRadius: initialRadius,
    timer: STORM_PHASES[0].waitTime,
    shrinking: false,
    pendingCommit: false,
    requestedPhase: null,
    entropyHash: null,
    damagePerTick: STORM_PHASES[0].damagePerTick,
    tickTimer: 0,
  }
}

export function applyStormCommit(storm: StormState, commit: StormCircleCommit): boolean {
  if (commit.phase !== storm.phase) {return false}
  if (storm.shrinking && !storm.pendingCommit) {return false}

  const phaseDef = STORM_PHASES[storm.phase]
  storm.pendingCommit = false
  storm.requestedPhase = null
  storm.shrinking = true
  storm.shrinkFromCenterX = commit.currentCenterX
  storm.shrinkFromCenterY = commit.currentCenterY
  storm.shrinkFromRadius = commit.currentRadius
  storm.centerX = commit.currentCenterX
  storm.centerY = commit.currentCenterY
  storm.currentRadius = commit.currentRadius
  storm.targetRadius = phaseDef.endRadius
  storm.targetCenterX = clampStormCenter(commit.targetCenterX, phaseDef.endRadius, MAP_WIDTH)
  storm.targetCenterY = clampStormCenter(commit.targetCenterY, phaseDef.endRadius, MAP_HEIGHT)
  storm.timer = phaseDef.shrinkTime
  storm.entropyHash = commit.entropyHash ?? null
  return true
}

export function fallbackStormCommit(storm: StormState, gameId = 0): boolean {
  return applyStormCommit(storm, buildLocalStormCommit(storm, gameId))
}

export function updateStorm(storm: StormState, dt: number): StormUpdateResult {
  if (!storm.pendingCommit) {
    storm.timer -= dt
  } else {
    storm.timer = 0
  }
  storm.tickTimer += dt

  if (storm.timer <= 0) {
    if (!storm.shrinking) {
      if (storm.verified) {
        if (!storm.pendingCommit) {
          storm.pendingCommit = true
          storm.requestedPhase = storm.phase
          storm.timer = 0
          return {
            gameOver: false,
            commitRequest: { phase: storm.phase },
          }
        }
      } else {
        fallbackStormCommit(storm)
      }
    } else {
      // Move to next phase
      storm.shrinking = false
      storm.phase++
      if (storm.phase >= STORM_PHASES.length) {
        storm.phase = STORM_PHASES.length - 1
        storm.currentRadius = 0
        return {
          gameOver: true,
          commitRequest: null,
        }
      }
      storm.damagePerTick = STORM_PHASES[storm.phase].damagePerTick
      storm.timer = STORM_PHASES[storm.phase].waitTime
      storm.entropyHash = null
    }
  }

  // Interpolate during shrinking
  if (storm.shrinking) {
    const phaseDef = STORM_PHASES[storm.phase]
    const progress = 1 - (storm.timer / phaseDef.shrinkTime)
    storm.currentRadius = storm.shrinkFromRadius + (storm.targetRadius - storm.shrinkFromRadius) * progress
    storm.centerX = storm.shrinkFromCenterX + (storm.targetCenterX - storm.shrinkFromCenterX) * progress
    storm.centerY = storm.shrinkFromCenterY + (storm.targetCenterY - storm.shrinkFromCenterY) * progress
  }

  return {
    gameOver: false,
    commitRequest: null,
  }
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
