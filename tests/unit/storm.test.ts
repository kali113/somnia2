import { describe, expect, it } from 'vitest'

import { MAP_HEIGHT, MAP_WIDTH, STORM_PHASES } from '@/lib/game/constants'
import {
  applyStormCommit,
  createStorm,
  fallbackStormCommit,
  isInStorm,
  renderStorm,
  renderStormMinimap,
  updateStorm,
} from '@/lib/game/storm'

function createMockContext() {
  const calls: Array<{ name: string; args: unknown[] }> = []
  const ctx = {
    fillStyle: '',
    lineWidth: 0,
    strokeStyle: '',
    save() {
      calls.push({ name: 'save', args: [] })
    },
    beginPath() {
      calls.push({ name: 'beginPath', args: [] })
    },
    rect(x: number, y: number, w: number, h: number) {
      calls.push({ name: 'rect', args: [x, y, w, h] })
    },
    arc(x: number, y: number, r: number, start: number, end: number, anticlockwise?: boolean) {
      calls.push({ name: 'arc', args: [x, y, r, start, end, anticlockwise] })
    },
    closePath() {
      calls.push({ name: 'closePath', args: [] })
    },
    fill() {
      calls.push({ name: 'fill', args: [] })
    },
    stroke() {
      calls.push({ name: 'stroke', args: [] })
    },
    setLineDash(pattern: number[]) {
      calls.push({ name: 'setLineDash', args: [pattern] })
    },
    restore() {
      calls.push({ name: 'restore', args: [] })
    },
  }

  return {
    calls,
    ctx: ctx as unknown as CanvasRenderingContext2D,
  }
}

describe('storm state', () => {
  it('creates a verified storm with sane defaults', () => {
    const defaultStorm = createStorm()
    const storm = createStorm({ seed: 77, verified: true })
    const fallbackSeedStorm = createStorm({ seed: 0 })

    expect(defaultStorm.seed).toBe(1)
    expect(defaultStorm.verified).toBe(false)
    expect(storm.seed).toBe(77)
    expect(storm.verified).toBe(true)
    expect(storm.phase).toBe(0)
    expect(storm.currentRadius).toBe(MAP_WIDTH * 0.7)
    expect(storm.timer).toBe(STORM_PHASES[0].waitTime)
    expect(fallbackSeedStorm.seed).toBe(1)
  })

  it('rejects invalid commits and clamps accepted targets into the map', () => {
    const storm = createStorm({ seed: 10 })

    expect(applyStormCommit(storm, {
      gameId: 3,
      phase: 1,
      currentCenterX: storm.centerX,
      currentCenterY: storm.centerY,
      currentRadius: storm.currentRadius,
      targetCenterX: storm.centerX,
      targetCenterY: storm.centerY,
      targetRadius: 100,
      entropyHash: '0xdead',
    })).toBe(false)

    storm.shrinking = true
    expect(applyStormCommit(storm, {
      gameId: 3,
      phase: 0,
      currentCenterX: storm.centerX,
      currentCenterY: storm.centerY,
      currentRadius: storm.currentRadius,
      targetCenterX: storm.centerX,
      targetCenterY: storm.centerY,
      targetRadius: 100,
      entropyHash: '0xbeef',
    })).toBe(false)

    storm.shrinking = false
    storm.pendingCommit = true

    expect(applyStormCommit(storm, {
      gameId: 3,
      phase: 0,
      currentCenterX: storm.centerX,
      currentCenterY: storm.centerY,
      currentRadius: storm.currentRadius,
      targetCenterX: -500,
      targetCenterY: MAP_HEIGHT + 500,
      targetRadius: 5,
      entropyHash: '0xcafe',
    })).toBe(true)

    expect(storm.shrinking).toBe(true)
    expect(storm.pendingCommit).toBe(false)
    expect(storm.targetRadius).toBe(STORM_PHASES[0].endRadius)
    expect(storm.targetCenterX).toBe(STORM_PHASES[0].endRadius)
    expect(storm.targetCenterY).toBe(MAP_HEIGHT - STORM_PHASES[0].endRadius)
    expect(storm.entropyHash).toBe('0xcafe')

    const nullEntropyStorm = createStorm({ seed: 11 })
    nullEntropyStorm.pendingCommit = true
    expect(applyStormCommit(nullEntropyStorm, {
      gameId: 4,
      phase: 0,
      currentCenterX: nullEntropyStorm.centerX,
      currentCenterY: nullEntropyStorm.centerY,
      currentRadius: nullEntropyStorm.currentRadius,
      targetCenterX: nullEntropyStorm.centerX,
      targetCenterY: nullEntropyStorm.centerY,
      targetRadius: STORM_PHASES[0].endRadius,
      entropyHash: null,
    })).toBe(true)
    expect(nullEntropyStorm.entropyHash).toBeNull()
  })

  it('builds a deterministic fallback commit when verification is unavailable', () => {
    const storm = createStorm({ seed: 50312 })

    expect(fallbackStormCommit(storm, 9)).toBe(true)
    expect(storm.shrinking).toBe(true)
    expect(storm.entropyHash).toBe(`local-${storm.seed.toString(16)}-0`)
  })

  it('requests a verified commit exactly once when a phase expires', () => {
    const storm = createStorm({ seed: 19, verified: true })
    const waiting = createStorm({ seed: 21, verified: true })

    const beforeExpiry = updateStorm(waiting, 0.5)
    expect(beforeExpiry.commitRequest).toBeNull()
    expect(waiting.pendingCommit).toBe(false)

    const first = updateStorm(storm, storm.timer + 0.1)
    expect(first.gameOver).toBe(false)
    expect(first.commitRequest).toEqual({ phase: 0 })
    expect(storm.pendingCommit).toBe(true)
    expect(storm.requestedPhase).toBe(0)

    const second = updateStorm(storm, 1)
    expect(second.commitRequest).toBeNull()
    expect(storm.timer).toBe(0)
  })

  it('falls back locally for unverified storms and eventually ends the match', () => {
    const storm = createStorm({ seed: 1234, verified: false })
    const first = updateStorm(storm, storm.timer + 0.1)

    expect(first.commitRequest).toBeNull()
    expect(storm.shrinking).toBe(true)
    expect(isInStorm(storm, storm.centerX + storm.currentRadius + 1, storm.centerY)).toBe(true)
    expect(isInStorm(storm, storm.centerX, storm.centerY)).toBe(false)

    let result = first
    let steps = 0
    while (!result.gameOver && steps < STORM_PHASES.length * 3) {
      result = updateStorm(storm, storm.timer + 1)
      steps += 1
    }

    expect(result.gameOver).toBe(true)
    expect(storm.currentRadius).toBe(0)
    expect(steps).toBeGreaterThan(0)
  })

  it('renders the storm overlay and minimap rings', () => {
    const storm = createStorm({ seed: 42, verified: false })
    fallbackStormCommit(storm, 12)

    const { ctx, calls } = createMockContext()
    renderStorm(
      ctx,
      storm,
      {
        x: 5,
        y: 10,
        width: 320,
        height: 180,
        targetX: 5,
        targetY: 10,
        lerp: 0.08,
      },
      0.75,
    )

    expect(calls.some((call) => call.name === 'rect')).toBe(true)
    expect(calls.filter((call) => call.name === 'arc')).toHaveLength(3)
    expect(calls.some((call) => call.name === 'setLineDash')).toBe(true)

    const idleStorm = createStorm({ seed: 12, verified: false })
    const idleOverlay = createMockContext()
    renderStorm(
      idleOverlay.ctx,
      idleStorm,
      {
        x: 0,
        y: 0,
        width: 320,
        height: 180,
        targetX: 0,
        targetY: 0,
        lerp: 0.08,
      },
      1,
    )
    expect(idleOverlay.calls.filter((call) => call.name === 'arc')).toHaveLength(2)

    const minimap = createMockContext()
    renderStormMinimap(minimap.ctx, storm, 12, 16, 96)

    expect(minimap.calls.filter((call) => call.name === 'arc')).toHaveLength(1)
    expect(minimap.calls.filter((call) => call.name === 'stroke')).toHaveLength(1)
  })
})
