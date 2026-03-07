// ── Pixel Art Sprite Drawing ─────────────────────────────────────────────────
// All sprites drawn procedurally via Canvas 2D API. No image assets needed.

import { COLORS, RARITY_COLORS, type Rarity, type BuildMaterial, type BuildPieceId, type ContainerType } from './constants'

// ── Player / Bot ────────────────────────────────────────────────────────────

export function drawPlayer(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  angle: number,
  color: string,
  outline: string,
  size: number,
  health: number,
  shield: number,
  name: string,
  isAlive: boolean,
) {
  if (!isAlive) {return}
  ctx.save()
  ctx.translate(x, y)

  // Body circle
  ctx.fillStyle = outline
  ctx.beginPath()
  ctx.arc(0, 0, size / 2 + 1, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(0, 0, size / 2, 0, Math.PI * 2)
  ctx.fill()

  // Eyes direction
  const ex = Math.cos(angle) * size * 0.2
  const ey = Math.sin(angle) * size * 0.2
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  ctx.arc(ex - 3, ey - 2, 3, 0, Math.PI * 2)
  ctx.arc(ex + 3, ey - 2, 3, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#111'
  ctx.beginPath()
  ctx.arc(ex - 2, ey - 2, 1.5, 0, Math.PI * 2)
  ctx.arc(ex + 4, ey - 2, 1.5, 0, Math.PI * 2)
  ctx.fill()

  // Gun barrel
  ctx.strokeStyle = '#555'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(Math.cos(angle) * (size / 2 + 10), Math.sin(angle) * (size / 2 + 10))
  ctx.stroke()

  // Health bar background
  const barW = 28
  const barH = 3
  const barY = -size / 2 - 10

  if (shield > 0) {
    ctx.fillStyle = '#333'
    ctx.fillRect(-barW / 2, barY - 5, barW, barH)
    ctx.fillStyle = COLORS.shieldBar
    ctx.fillRect(-barW / 2, barY - 5, barW * (shield / 100), barH)
  }

  ctx.fillStyle = '#333'
  ctx.fillRect(-barW / 2, barY, barW, barH)
  ctx.fillStyle = health > 60 ? COLORS.healthBar : health > 25 ? '#ffcc00' : '#ff3333'
  ctx.fillRect(-barW / 2, barY, barW * (health / 100), barH)

  // Name
  ctx.fillStyle = '#fff'
  ctx.font = '9px monospace'
  ctx.textAlign = 'center'
  ctx.fillText(name, 0, -size / 2 - 14)

  ctx.restore()
}

// ── Trees ───────────────────────────────────────────────────────────────────

export function drawTree(ctx: CanvasRenderingContext2D, x: number, y: number) {
  // Trunk
  ctx.fillStyle = COLORS.treeTrunk
  ctx.fillRect(x - 3, y - 2, 6, 10)
  // Canopy layers
  ctx.fillStyle = '#1e5216'
  ctx.beginPath()
  ctx.arc(x, y - 6, 12, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = COLORS.tree
  ctx.beginPath()
  ctx.arc(x, y - 8, 10, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#3a7a2a'
  ctx.beginPath()
  ctx.arc(x + 2, y - 10, 7, 0, Math.PI * 2)
  ctx.fill()
}

// ── Rocks ───────────────────────────────────────────────────────────────────

export function drawRock(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = '#6a6a6a'
  ctx.beginPath()
  ctx.moveTo(x - 10, y + 5)
  ctx.lineTo(x - 7, y - 8)
  ctx.lineTo(x + 3, y - 10)
  ctx.lineTo(x + 10, y - 4)
  ctx.lineTo(x + 8, y + 5)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = COLORS.rock
  ctx.beginPath()
  ctx.moveTo(x - 8, y + 3)
  ctx.lineTo(x - 5, y - 6)
  ctx.lineTo(x + 4, y - 8)
  ctx.lineTo(x + 8, y - 2)
  ctx.lineTo(x + 6, y + 3)
  ctx.closePath()
  ctx.fill()
}

// ── Cars ────────────────────────────────────────────────────────────────────

export function drawCar(ctx: CanvasRenderingContext2D, x: number, y: number, healthPct: number) {
  const bodyColor = healthPct > 0.55 ? '#4f78b3' : healthPct > 0.25 ? '#7a5f40' : '#7f3f3f'
  const roofColor = healthPct > 0.55 ? '#79a5e3' : healthPct > 0.25 ? '#9a7d5c' : '#a35555'

  ctx.fillStyle = 'rgba(0,0,0,0.25)'
  ctx.fillRect(x - 14, y + 8, 28, 3)

  ctx.fillStyle = bodyColor
  ctx.fillRect(x - 14, y - 6, 28, 12)
  ctx.fillStyle = roofColor
  ctx.fillRect(x - 8, y - 10, 16, 8)

  ctx.fillStyle = '#2b2b2b'
  ctx.fillRect(x - 12, y - 8, 5, 3)
  ctx.fillRect(x + 7, y - 8, 5, 3)
  ctx.fillRect(x - 14, y + 4, 6, 3)
  ctx.fillRect(x + 8, y + 4, 6, 3)
}

// ── Containers ──────────────────────────────────────────────────────────────

export function drawContainer(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  opened: boolean,
  pendingVerification: boolean,
  type: ContainerType,
  highlighted: boolean,
  time: number,
) {
  if (opened) {
    if (type === 'ammo_box') {
      ctx.fillStyle = '#6a4a26'
      ctx.fillRect(x - 8, y - 6, 16, 12)
      ctx.fillStyle = '#2a2a2a'
      ctx.fillRect(x - 4, y - 2, 8, 3)
      return
    }
    ctx.fillStyle = type === 'rare_chest' ? '#376f96' : '#8a6a2a'
    ctx.fillRect(x - 8, y - 4, 16, 10)
    return
  }

  if (type === 'ammo_box') {
    const glowPulse = highlighted ? Math.sin(time * 8) * 0.16 + 0.76 : 0.35
    const glowColor = pendingVerification ? '80, 232, 255' : '255, 179, 71'
    ctx.fillStyle = `rgba(${glowColor}, ${0.18 * glowPulse})`
    ctx.beginPath()
    ctx.arc(x, y, highlighted ? 19 : 14, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillStyle = '#8b5a2b'
    ctx.fillRect(x - 9, y - 7, 18, 14)
    ctx.fillStyle = COLORS.ammoBox
    ctx.fillRect(x - 8, y - 6, 16, 12)
    ctx.fillStyle = '#2a2a2a'
    ctx.fillRect(x - 5, y - 2, 10, 3)
    ctx.fillRect(x - 1, y - 5, 2, 9)
    return
  }

  const glowPulse = highlighted ? Math.sin(time * 6) * 0.15 + 0.75 : 0.4
  const glowColor = pendingVerification
    ? '80, 232, 255'
    : type === 'rare_chest'
      ? '80, 180, 255'
      : '255, 215, 0'
  ctx.fillStyle = `rgba(${glowColor}, ${0.22 * glowPulse})`
  ctx.beginPath()
  ctx.arc(x, y, highlighted ? 24 : 17, 0, Math.PI * 2)
  ctx.fill()

  // Container body
  ctx.fillStyle = type === 'rare_chest' ? '#2f7db8' : '#b8860b'
  ctx.fillRect(x - 9, y - 5, 18, 12)
  ctx.fillStyle = type === 'rare_chest' ? '#57b4ff' : COLORS.chest
  ctx.fillRect(x - 8, y - 4, 16, 10)
  // Lock
  ctx.fillStyle = type === 'rare_chest' ? '#1a5078' : '#8a6a2a'
  ctx.fillRect(x - 2, y - 1, 4, 4)
}

export function drawAmmoPack(ctx: CanvasRenderingContext2D, x: number, y: number, time: number) {
  const bob = Math.sin(time * 4) * 1.8
  ctx.fillStyle = 'rgba(255, 190, 60, 0.2)'
  ctx.beginPath()
  ctx.arc(x, y + bob, 12, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = '#ffb74d'
  ctx.fillRect(x - 8, y - 5 + bob, 16, 10)
  ctx.fillStyle = '#8c5b1f'
  ctx.fillRect(x - 8, y - 1 + bob, 16, 2)
  ctx.fillStyle = '#2b2b2b'
  ctx.fillRect(x - 5, y - 4 + bob, 3, 8)
  ctx.fillRect(x - 1, y - 4 + bob, 3, 8)
  ctx.fillRect(x + 3, y - 4 + bob, 3, 8)
}

// ── Loot Item on Ground ─────────────────────────────────────────────────────

export function drawLootItem(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  rarity: Rarity,
  isWeapon: boolean,
  time: number,
) {
  const bob = Math.sin(time * 3) * 2
  const color = RARITY_COLORS[rarity]

  // Glow
  ctx.fillStyle = color + '30'
  ctx.beginPath()
  ctx.arc(x, y + bob, 14, 0, Math.PI * 2)
  ctx.fill()

  // Item shape
  ctx.fillStyle = color
  if (isWeapon) {
    ctx.fillRect(x - 8, y - 3 + bob, 16, 6)
    ctx.fillStyle = '#333'
    ctx.fillRect(x - 6, y - 1 + bob, 4, 2)
  } else {
    ctx.beginPath()
    ctx.arc(x, y + bob, 6, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.font = '8px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('+', x, y + 3 + bob)
  }

  // Rarity border
  ctx.strokeStyle = color
  ctx.lineWidth = 1.5
  ctx.strokeRect(x - 10, y - 6 + bob, 20, 12)
}

// ── Supply Drop ─────────────────────────────────────────────────────────────

export function drawSupplyDrop(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  time: number,
  falling: boolean,
) {
  const glow = Math.sin(time * 4) * 0.3 + 0.7

  // Parachute if falling
  if (falling) {
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(x - 15, y - 30)
    ctx.quadraticCurveTo(x, y - 45, x + 15, y - 30)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(x - 15, y - 30)
    ctx.lineTo(x, y - 10)
    ctx.lineTo(x + 15, y - 30)
    ctx.stroke()
  }

  // Glow
  ctx.fillStyle = `rgba(0, 229, 255, ${glow * 0.2})`
  ctx.beginPath()
  ctx.arc(x, y, 20, 0, Math.PI * 2)
  ctx.fill()

  // Box
  ctx.fillStyle = COLORS.supplyDrop
  ctx.fillRect(x - 10, y - 8, 20, 16)
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = 1
  ctx.strokeRect(x - 10, y - 8, 20, 16)

  // Cross
  ctx.strokeStyle = '#004d5c'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(x, y - 6)
  ctx.lineTo(x, y + 6)
  ctx.moveTo(x - 6, y)
  ctx.lineTo(x + 6, y)
  ctx.stroke()
}

// ── Building Piece ──────────────────────────────────────────────────────────

export function drawBuildPiece(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  w: number, h: number,
  material: BuildMaterial,
  pieceId: BuildPieceId,
  rotation: 0 | 1,
  health: number,
  maxHealth: number,
  isPreview?: boolean,
  canPlace = true,
) {
  const alpha = isPreview ? 0.4 : 0.9
  const colors = {
    wood: `rgba(139, 90, 43, ${alpha})`,
    stone: `rgba(140, 140, 140, ${alpha})`,
    metal: `rgba(160, 170, 180, ${alpha})`,
  }

  ctx.fillStyle = colors[material]
  ctx.fillRect(x, y, w, h)

  // Detail lines
  ctx.strokeStyle = isPreview ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)'
  ctx.lineWidth = 1
  if (pieceId === 'wall') {
    if (material === 'wood') {
      for (let i = 4; i < w; i += 8) {
        ctx.beginPath()
        ctx.moveTo(x + i, y)
        ctx.lineTo(x + i, y + h)
        ctx.stroke()
      }
    } else {
      ctx.strokeRect(x + 2, y + 2, w / 2 - 2, h / 2 - 2)
      ctx.strokeRect(x + w / 2 + 1, y + h / 2 + 1, w / 2 - 3, h / 2 - 3)
    }
  } else if (pieceId === 'barricade') {
    if (rotation === 0) {
      ctx.beginPath()
      ctx.moveTo(x + 4, y + h / 2)
      ctx.lineTo(x + w - 4, y + h / 2)
      ctx.stroke()
    } else {
      ctx.beginPath()
      ctx.moveTo(x + w / 2, y + 4)
      ctx.lineTo(x + w / 2, y + h - 4)
      ctx.stroke()
    }
    ctx.strokeRect(x + 2, y + 2, w - 4, h - 4)
  } else {
    ctx.strokeRect(x + 2, y + 2, w - 4, h - 4)
    ctx.strokeRect(x + 7, y + 7, w - 14, h - 14)
    ctx.fillStyle = isPreview ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.18)'
    ctx.fillRect(x + w / 2 - 5, y + h / 2 - 5, 10, 10)
  }

  // Border
  ctx.strokeStyle = isPreview
    ? (canPlace ? 'rgba(76,255,76,0.8)' : 'rgba(255,80,80,0.85)')
    : 'rgba(0,0,0,0.5)'
  ctx.lineWidth = isPreview ? 2 : 1
  ctx.strokeRect(x, y, w, h)

  // Health indicator
  if (!isPreview && health < maxHealth) {
    const pct = health / maxHealth
    ctx.fillStyle = '#333'
    ctx.fillRect(x, y + h - 3, w, 3)
    ctx.fillStyle = pct > 0.5 ? '#4cff4c' : pct > 0.25 ? '#ffcc00' : '#ff3333'
    ctx.fillRect(x, y + h - 3, w * pct, 3)
  }
}

// ── Bullet ──────────────────────────────────────────────────────────────────

export function drawBullet(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  angle: number,
) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(angle)

  // Trail
  ctx.fillStyle = 'rgba(255, 220, 100, 0.6)'
  ctx.fillRect(-8, -1, 8, 2)

  // Head
  ctx.fillStyle = '#ffe066'
  ctx.beginPath()
  ctx.arc(0, 0, 2.5, 0, Math.PI * 2)
  ctx.fill()

  ctx.restore()
}

// ── Damage Number ───────────────────────────────────────────────────────────

export function drawDamageNumber(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  damage: number,
  isShield: boolean,
  alpha: number,
) {
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.fillStyle = isShield ? '#4ca6ff' : '#fff'
  ctx.strokeStyle = '#000'
  ctx.lineWidth = 2
  ctx.font = 'bold 14px monospace'
  ctx.textAlign = 'center'
  const text = `-${Math.round(damage)}`
  ctx.strokeText(text, x, y)
  ctx.fillText(text, x, y)
  ctx.restore()
}

// ── Elimination Effect ──────────────────────────────────────────────────────

export function drawElimEffect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  progress: number,
) {
  const particles = 8
  const maxR = 40 * progress
  ctx.save()
  ctx.globalAlpha = 1 - progress
  for (let i = 0; i < particles; i++) {
    const angle = (i / particles) * Math.PI * 2
    const px = x + Math.cos(angle) * maxR
    const py = y + Math.sin(angle) * maxR
    ctx.fillStyle = i % 2 === 0 ? '#ffe066' : '#ff6644'
    ctx.fillRect(px - 3, py - 3, 6, 6)
  }
  ctx.restore()
}

// ── Minimap ─────────────────────────────────────────────────────────────────

export function drawMinimapDot(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  color: string,
  size: number,
) {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(x, y, size, 0, Math.PI * 2)
  ctx.fill()
}
