'use client'

import { WEAPONS, ITEMS, RARITY_COLORS, BUILD_PIECE_ORDER, BUILD_PIECES, type BuildPieceId } from '@/lib/game/constants'
import type { Player } from '@/lib/game/player'
import type { StormState } from '@/lib/game/storm'
import type { ContainerPromptState } from '@/lib/game/engine'
import { Shield, Heart, TreePine, Mountain, Wrench } from 'lucide-react'

interface GameHUDProps {
  player: Player | null
  aliveCount: number
  storm: StormState | null
  gameTime: number
  containerPrompt: ContainerPromptState | null
  touchControls?: boolean
  onSelectSlot?: (slotIndex: number) => void
  onSelectBuildPiece?: (pieceId: BuildPieceId) => void
  onCycleBuildMaterial?: () => void
}

function containerLabel(type: ContainerPromptState['containerType']): string {
  if (type === 'rare_chest') {return 'RARE CHEST'}
  if (type === 'ammo_box') {return 'AMMO BOX'}
  return 'CHEST'
}

export default function GameHUD({
  player,
  aliveCount,
  storm,
  gameTime,
  containerPrompt,
  touchControls = false,
  onSelectSlot,
  onSelectBuildPiece,
  onCycleBuildMaterial,
}: GameHUDProps) {
  if (!player) {return null}

  const activePiece = BUILD_PIECES[player.buildPiece]
  const canAffordPiece = player[player.buildMaterial] >= activePiece.baseCost
  const activeUse = player.activeConsumableUse
  const activeUseDef = activeUse ? ITEMS[activeUse.itemId] : null
  const activeUseDuration = activeUse ? Math.max(0.001, activeUse.endsAt - activeUse.startedAt) : 1
  const activeUseProgress = activeUse ? Math.min(1, Math.max(0, (gameTime - activeUse.startedAt) / activeUseDuration)) : 0
  const activeUseRemaining = activeUse ? Math.max(0, activeUse.endsAt - gameTime) : 0
  const touchHudBottomInset = touchControls ? 'calc(env(safe-area-inset-bottom) + 13rem)' : '1rem'
  const showMaterials = !touchControls || player.buildMode
  const showConsumables = !touchControls
    || Boolean(activeUse)
    || player.consumables.bandage > 0
    || player.consumables.medkit > 0
    || player.consumables.mini_shield > 0
    || player.consumables.shield_potion > 0
  const touchBottomPanelWidth = 'min(calc(100vw - 7.25rem), 15.5rem)'

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      {/* Top bar */}
      <div
        className={`flex flex-wrap items-center gap-2 px-3 sm:gap-6 ${touchControls ? 'justify-start pr-28' : 'justify-center'}`}
        style={{ paddingTop: touchControls ? 'calc(env(safe-area-inset-top) + 3.5rem)' : '0.75rem' }}
      >
        {/* Alive count */}
        <div className="flex items-center gap-2 rounded-lg bg-[rgba(0,0,0,0.75)] px-4 py-2 text-sm font-mono text-white backdrop-blur-sm">
          <span className="text-[#4cff4c]">{aliveCount}</span>
          <span className="text-[rgba(255,255,255,0.6)]">alive</span>
        </div>

        {/* Storm info */}
        {storm && (
          <div className="flex items-center gap-2 rounded-lg bg-[rgba(0,0,0,0.75)] px-4 py-2 text-sm font-mono text-white backdrop-blur-sm">
            <span className="text-[#7b2dff]">Storm</span>
            <span className="text-[rgba(255,255,255,0.6)]">Phase {storm.phase + 1}</span>
            <span className="text-white">{formatTime(Math.max(0, storm.timer))}</span>
          </div>
        )}

        {/* Kills */}
        <div className="flex items-center gap-2 rounded-lg bg-[rgba(0,0,0,0.75)] px-4 py-2 text-sm font-mono text-white backdrop-blur-sm">
          <span className="text-[#ff4444]">{player.kills}</span>
          <span className="text-[rgba(255,255,255,0.6)]">kills</span>
        </div>
      </div>

      {/* Bottom section */}
      <div
        className={`absolute bottom-0 left-0 right-0 flex flex-col items-center px-3 ${touchControls ? 'gap-1.5' : 'gap-2'}`}
        style={{ paddingBottom: touchHudBottomInset }}
      >
        {/* Health & Shield bars */}
        <div className={`flex flex-col gap-1 ${touchControls ? 'w-[min(15rem,calc(100vw-1.5rem))]' : 'w-[min(18rem,calc(100vw-1.5rem))] sm:w-72'}`}>
          {/* Shield */}
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-[#4ca6ff]" />
            <div className="flex-1 h-4 rounded bg-[rgba(0,0,0,0.6)] overflow-hidden">
              <div
                className="h-full rounded transition-all duration-200"
                style={{
                  width: `${player.shield}%`,
                  backgroundColor: '#4ca6ff',
                }}
              />
            </div>
            <span className="font-mono text-xs text-[#4ca6ff] w-8 text-right">{Math.ceil(player.shield)}</span>
          </div>

          {/* Health */}
          <div className="flex items-center gap-2">
            <Heart className="h-4 w-4 text-[#4cff4c]" />
            <div className="flex-1 h-4 rounded bg-[rgba(0,0,0,0.6)] overflow-hidden">
              <div
                className="h-full rounded transition-all duration-200"
                style={{
                  width: `${player.health}%`,
                  backgroundColor: player.health > 60 ? '#4cff4c' : player.health > 25 ? '#ffcc00' : '#ff3333',
                }}
              />
            </div>
            <span className="font-mono text-xs text-white w-8 text-right">{Math.ceil(player.health)}</span>
          </div>
        </div>

        {/* Inventory slots */}
        <div
          className={touchControls
            ? 'flex self-start gap-0.5 pl-0.5'
            : 'flex w-full max-w-[24rem] justify-center gap-1'}
          style={touchControls ? { width: touchBottomPanelWidth } : undefined}
        >
          {player.slots.map((slot, i) => {
            const isActive = i === player.activeSlot
            const weapon = slot ? WEAPONS[slot.weaponId] : null
            const rarityColor = slot ? RARITY_COLORS[slot.rarity] : 'transparent'
            const slotLabel = weapon ? weapon.name : 'Empty slot'

            return (
              <button
                key={i}
                type="button"
                onClick={() => onSelectSlot?.(i)}
                tabIndex={onSelectSlot ? 0 : -1}
                className={`relative flex min-w-0 flex-1 flex-col items-center justify-center rounded-lg ${touchControls ? 'h-[3.35rem]' : 'h-[3.8rem] sm:h-16 sm:max-w-16'} ${onSelectSlot ? 'pointer-events-auto' : ''}`}
                aria-label={`Select slot ${i + 1}: ${slotLabel}`}
                style={{
                  backgroundColor: isActive ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.65)',
                  border: isActive
                    ? `2px solid ${rarityColor || '#fff'}`
                    : '1px solid rgba(255,255,255,0.15)',
                }}
              >
                {/* Slot number */}
                <span className="absolute top-0.5 left-1.5 text-[10px] font-mono text-[rgba(255,255,255,0.5)]">
                  {i + 1}
                </span>

                {weapon ? (
                  <>
                    {/* Weapon name */}
                    <span
                      className="mt-2 text-center font-mono text-[8px] leading-tight sm:text-[9px]"
                      style={{ color: rarityColor }}
                    >
                      {weapon.name}
                    </span>
                    {/* Ammo */}
                    {!weapon.isMelee && slot && (
                      <span className="mt-0.5 font-mono text-[9px] text-white sm:text-[10px]">
                        {slot.ammo}/{slot.reserveAmmo}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-[9px] text-[rgba(255,255,255,0.3)] sm:text-[10px]">Empty</span>
                )}

                {/* Rarity bar */}
                {slot && (
                  <div
                    className="absolute bottom-0 left-0 right-0 h-1 rounded-b-lg"
                    style={{ backgroundColor: rarityColor }}
                  />
                )}
              </button>
            )
          })}
        </div>

        {/* Materials */}
        {showMaterials && (
          <div className={`flex flex-wrap items-center justify-center ${touchControls ? 'gap-2 text-[11px]' : 'gap-3'}`}>
            <div className="flex items-center gap-1 text-xs font-mono">
              <TreePine className="h-3 w-3 text-[#8b5a2b]" />
              <span className="text-[#c49a6c]">{player.wood}</span>
            </div>
            <div className="flex items-center gap-1 text-xs font-mono">
              <Mountain className="h-3 w-3 text-[#888]" />
              <span className="text-[#aaa]">{player.stone}</span>
            </div>
            <div className="flex items-center gap-1 text-xs font-mono">
              <Wrench className="h-3 w-3 text-[#a0aab4]" />
              <span className="text-[#c0cad4]">{player.metal}</span>
            </div>
          </div>
        )}

        {/* Consumables */}
        {showConsumables && (
          <div className={`flex flex-wrap justify-center font-mono ${touchControls ? 'gap-1 text-[9px]' : 'gap-2 text-[10px]'}`}>
            <div className="rounded bg-[rgba(0,0,0,0.55)] px-2 py-1 text-[#ffd27a]">Bandage {player.consumables.bandage}</div>
            <div className="rounded bg-[rgba(0,0,0,0.55)] px-2 py-1 text-[#ffe8b0]">Medkit {player.consumables.medkit}</div>
            <div className="rounded bg-[rgba(0,0,0,0.55)] px-2 py-1 text-[#6dd0ff]">Mini {player.consumables.mini_shield}</div>
            <div className="rounded bg-[rgba(0,0,0,0.55)] px-2 py-1 text-[#4ca6ff]">Big {player.consumables.shield_potion}</div>
          </div>
        )}

        {/* Consumable use */}
        {activeUse && activeUseDef && (
          <div className="w-[min(18rem,calc(100vw-1.5rem))] rounded-lg border border-[rgba(120,210,255,0.45)] bg-[rgba(26,45,62,0.75)] px-3 py-2 sm:w-72">
            <div className="mb-1 flex items-center justify-between font-mono text-[11px] text-[#9be4ff]">
              <span>USING {activeUseDef.name.toUpperCase()}</span>
              <span>{activeUseRemaining.toFixed(1)}s</span>
            </div>
            <div className="h-2 overflow-hidden rounded bg-[rgba(255,255,255,0.15)]">
              <div
                className="h-full bg-[#63d7ff] transition-all duration-100"
                style={{ width: `${activeUseProgress * 100}%` }}
              />
            </div>
          </div>
        )}

        {containerPrompt && (
          <div
            className={`rounded-lg border border-[rgba(255,215,0,0.45)] bg-[rgba(0,0,0,0.7)] px-4 py-2 text-center font-mono ${touchControls ? 'self-start sm:w-auto' : 'sm:w-auto'}`}
            style={touchControls ? { width: touchBottomPanelWidth } : { width: 'min(18rem,calc(100vw-1.5rem))' }}
          >
            <div className="text-[11px] text-[#ffd166]">
              {containerLabel(containerPrompt.containerType)} NEARBY
            </div>
            <div className="text-[10px] text-[rgba(255,255,255,0.8)]">
              {containerPrompt.status === 'ready' && (
                <>
                  {touchControls ? 'Hold OPEN to search' : <>Hold <span className="text-[#3ae8ff]">{containerPrompt.key}</span> to search</>}
                </>
              )}
              {containerPrompt.status === 'searching' && (
                <>Searching... {Math.round(containerPrompt.progress * 100)}%</>
              )}
              {containerPrompt.status === 'verifying' && (
                <>Verifying on-chain...</>
              )}
            </div>
            {containerPrompt.status === 'searching' && (
              <div className="mt-2 h-1.5 w-44 overflow-hidden rounded bg-[rgba(255,255,255,0.15)]">
                <div
                  className="h-full bg-[#ffd166] transition-all duration-75"
                  style={{ width: `${Math.round(containerPrompt.progress * 100)}%` }}
                />
              </div>
            )}
          </div>
        )}

        {/* Build mode indicator */}
        {player.buildMode && (
          <div
            className={`rounded-lg border border-[rgba(76,255,76,0.4)] bg-[rgba(76,255,76,0.12)] font-mono text-xs text-[#d7ffe0] ${touchControls ? 'self-start px-3 py-2' : 'w-[min(18rem,calc(100vw-1.5rem))] px-4 py-2 sm:w-auto'}`}
            style={touchControls ? { width: touchBottomPanelWidth } : undefined}
          >
            <div className="text-[11px] text-[#4cff4c]">
              BUILD: {activePiece.name.toUpperCase()} ({player.buildMaterial.toUpperCase()}) - {activePiece.baseCost} mats
            </div>
            <div className={canAffordPiece ? 'text-[rgba(255,255,255,0.75)]' : 'text-[#ff7b7b]'}>
              {touchControls
                ? (canAffordPiece ? 'Aim to preview, tap PLACE to build, and use the piece/material buttons below.' : `Need ${activePiece.baseCost} ${player.buildMaterial}`)
                : (canAffordPiece ? activePiece.purpose : `Need ${activePiece.baseCost} ${player.buildMaterial}`)}
            </div>
            {touchControls ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => onCycleBuildMaterial?.()}
                  className="pointer-events-auto rounded-md border border-[rgba(255,255,255,0.16)] bg-[rgba(0,0,0,0.28)] px-2 py-1 text-[10px] text-[rgba(255,255,255,0.9)]"
                  aria-label={`Cycle build material. Current material ${player.buildMaterial}`}
                >
                  MAT {player.buildMaterial.toUpperCase()}
                </button>
                {BUILD_PIECE_ORDER.map((pieceId) => {
                  const piece = BUILD_PIECES[pieceId]
                  const selected = pieceId === player.buildPiece
                  return (
                    <button
                      key={pieceId}
                      type="button"
                      onClick={() => onSelectBuildPiece?.(pieceId)}
                      className={`pointer-events-auto rounded-md border px-2 py-1 text-[10px] ${selected
                        ? 'border-[rgba(76,255,76,0.5)] bg-[rgba(76,255,76,0.18)] text-[#d7ffe0]'
                        : 'border-[rgba(255,255,255,0.12)] bg-[rgba(0,0,0,0.22)] text-[rgba(255,255,255,0.76)]'}`}
                      aria-label={`Select build piece ${piece.name}`}
                    >
                      {piece.name}
                    </button>
                  )
                })}
              </div>
            ) : (
              <div className="mt-1 flex flex-wrap gap-2 text-[10px] text-[rgba(255,255,255,0.65)]">
                {BUILD_PIECE_ORDER.map((pieceId, index) => {
                  const piece = BUILD_PIECES[pieceId]
                  const selected = pieceId === player.buildPiece
                  return (
                    <span key={pieceId} className={selected ? 'text-[#4cff4c]' : ''}>
                      {`${index === 0 ? 'Z' : index === 1 ? 'X' : 'C'}:${piece.name}`}
                    </span>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Reload indicator */}
        {player.reloading && (
          <div className="rounded-lg bg-[rgba(255,204,0,0.2)] px-4 py-1 text-sm font-mono text-[#ffcc00] border border-[rgba(255,204,0,0.4)]">
            RELOADING...
          </div>
        )}
      </div>

      {!touchControls && (
        <div
          className="absolute left-3 bottom-3 font-mono text-[10px] leading-relaxed text-[rgba(255,255,255,0.3)]"
        >
          <>
            <div>WASD Move | Mouse Aim & Shoot</div>
            <div>1-5 Slots | R Reload (uses reserve ammo) | E Search Container | F Heal</div>
            <div>Build: Z/X/C Piece | R Material | E Rotate | G/Wheel Cycle Piece</div>
          </>
        </div>
      )}
    </div>
  )
}
