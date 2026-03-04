// ── Camera ──────────────────────────────────────────────────────────────────

import { MAP_WIDTH, MAP_HEIGHT } from './constants'

export interface Camera {
  x: number
  y: number
  width: number
  height: number
  targetX: number
  targetY: number
  lerp: number
}

export function createCamera(width: number, height: number): Camera {
  return {
    x: 0,
    y: 0,
    width,
    height,
    targetX: 0,
    targetY: 0,
    lerp: 0.08,
  }
}

export function updateCamera(cam: Camera, targetX: number, targetY: number, dt: number) {
  cam.targetX = targetX - cam.width / 2
  cam.targetY = targetY - cam.height / 2

  const speed = 1 - Math.pow(1 - cam.lerp, dt * 60)
  cam.x += (cam.targetX - cam.x) * speed
  cam.y += (cam.targetY - cam.y) * speed

  // Clamp to map bounds
  cam.x = Math.max(0, Math.min(MAP_WIDTH - cam.width, cam.x))
  cam.y = Math.max(0, Math.min(MAP_HEIGHT - cam.height, cam.y))
}

export function resizeCamera(cam: Camera, width: number, height: number) {
  cam.width = width
  cam.height = height
}

export function isOnScreen(cam: Camera, x: number, y: number, pad = 64): boolean {
  return (
    x >= cam.x - pad &&
    x <= cam.x + cam.width + pad &&
    y >= cam.y - pad &&
    y <= cam.y + cam.height + pad
  )
}
