'use client'

import { useEffect, useMemo, useRef, type MutableRefObject, type ReactNode } from 'react'
import { Crosshair, Hammer, HeartPulse, PackageOpen, RefreshCw, RotateCw } from 'lucide-react'
import type { GameState, ContainerPromptState } from '@/lib/game/engine'
import type { Player } from '@/lib/game/player'
import {
  clearVirtualAim,
  resetVirtualMove,
  setVirtualAim,
  setVirtualKeyHeld,
  setVirtualMove,
  tapVirtualClick,
  tapVirtualKey,
} from '@/lib/game/input'

interface MobileControlsProps {
  visible: boolean
  player: Player | null
  containerPrompt: ContainerPromptState | null
  gameStateRef: MutableRefObject<GameState | null>
}

interface ActionButtonProps {
  label: string
  icon: ReactNode
  testId?: string
  onTap?: () => void
  onHoldStart?: () => void
  onHoldEnd?: () => void
  disabled?: boolean
}

function ActionButton({
  label,
  icon,
  testId,
  onTap,
  onHoldStart,
  onHoldEnd,
  disabled,
}: ActionButtonProps) {
  return (
    <button
      type="button"
      data-testid={testId}
      disabled={disabled}
      className="pointer-events-auto flex h-11 w-11 touch-none flex-col items-center justify-center rounded-2xl border border-[rgba(255,255,255,0.12)] bg-[rgba(8,12,16,0.82)] text-[rgba(255,255,255,0.82)] shadow-[0_10px_30px_rgba(0,0,0,0.3)] backdrop-blur-sm transition active:scale-95 disabled:opacity-40"
      onPointerDown={(event) => {
        event.preventDefault()
        onHoldStart?.()
        if (!onHoldStart) {
          onTap?.()
        }
      }}
      onPointerUp={(event) => {
        event.preventDefault()
        onHoldEnd?.()
      }}
      onPointerCancel={onHoldEnd}
      onPointerLeave={(event) => {
        if (event.buttons === 0) {
          onHoldEnd?.()
        }
      }}
    >
      <span className="mb-0.5">{icon}</span>
      <span className="text-[8px] font-mono uppercase tracking-[0.16em]">{label}</span>
    </button>
  )
}

function clampStick(clientX: number, clientY: number, rect: DOMRect) {
  const centerX = rect.left + rect.width / 2
  const centerY = rect.top + rect.height / 2
  const radius = Math.max(24, rect.width / 2 - 10)
  const rawX = (clientX - centerX) / radius
  const rawY = (clientY - centerY) / radius
  const length = Math.hypot(rawX, rawY)
  if (length <= 1 || length === 0) {
    return { x: rawX, y: rawY }
  }
  return { x: rawX / length, y: rawY / length }
}

export default function MobileControls({
  visible,
  player,
  containerPrompt,
  gameStateRef,
}: MobileControlsProps) {
  const movePointerIdRef = useRef<number | null>(null)
  const aimPointerIdRef = useRef<number | null>(null)

  const withInput = (handler: (state: GameState) => void) => {
    const state = gameStateRef.current
    if (!state) return
    handler(state)
  }

  useEffect(() => {
    if (visible) return
    const state = gameStateRef.current
    if (!state) return
    resetVirtualMove(state.input)
    clearVirtualAim(state.input)
    setVirtualKeyHeld(state.input, 'e', false)
  }, [gameStateRef, visible])

  const interactLabel = useMemo(() => {
    if (player?.buildMode) return 'Rotate'
    if (containerPrompt) return 'Open'
    return 'Use'
  }, [containerPrompt, player?.buildMode])

  if (!visible || !player) return null

  return (
    <div
      className="pointer-events-none absolute inset-0 z-20"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <div className="absolute bottom-5 left-3">
        <div
          data-testid="mobile-move-pad"
          className="pointer-events-auto relative flex h-28 w-28 touch-none items-center justify-center rounded-full border border-[rgba(255,255,255,0.12)] bg-[radial-gradient(circle_at_center,rgba(58,232,255,0.18),rgba(5,10,14,0.86)_70%)] shadow-[0_18px_42px_rgba(0,0,0,0.35)] backdrop-blur-sm"
          onPointerDown={(event) => {
            event.preventDefault()
            movePointerIdRef.current = event.pointerId
            event.currentTarget.setPointerCapture(event.pointerId)
            const next = clampStick(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect())
            withInput((state) => setVirtualMove(state.input, next.x, next.y))
          }}
          onPointerMove={(event) => {
            if (movePointerIdRef.current !== event.pointerId) return
            event.preventDefault()
            const next = clampStick(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect())
            withInput((state) => setVirtualMove(state.input, next.x, next.y))
          }}
          onPointerUp={(event) => {
            if (movePointerIdRef.current !== event.pointerId) return
            event.preventDefault()
            movePointerIdRef.current = null
            event.currentTarget.releasePointerCapture(event.pointerId)
            withInput((state) => resetVirtualMove(state.input))
          }}
          onPointerCancel={(event) => {
            if (movePointerIdRef.current !== event.pointerId) return
            movePointerIdRef.current = null
            withInput((state) => resetVirtualMove(state.input))
          }}
        >
          <div className="pointer-events-none flex h-10 w-10 items-center justify-center rounded-full border border-[rgba(255,255,255,0.16)] bg-[rgba(255,255,255,0.08)]">
            <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-[rgba(255,255,255,0.75)]">Move</span>
          </div>
        </div>
      </div>

      <div className="absolute bottom-5 right-3">
        <div
          data-testid="mobile-aim-pad"
          className="pointer-events-auto relative flex h-32 w-32 touch-none items-center justify-center rounded-full border border-[rgba(255,255,255,0.14)] bg-[radial-gradient(circle_at_center,rgba(255,82,82,0.18),rgba(7,10,14,0.88)_72%)] shadow-[0_18px_42px_rgba(0,0,0,0.35)] backdrop-blur-sm"
          onPointerDown={(event) => {
            event.preventDefault()
            aimPointerIdRef.current = event.pointerId
            event.currentTarget.setPointerCapture(event.pointerId)
            const next = clampStick(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect())
            const angleX = Math.abs(next.x) < 0.12 && Math.abs(next.y) < 0.12 ? Math.cos(player.angle) : next.x
            const angleY = Math.abs(next.x) < 0.12 && Math.abs(next.y) < 0.12 ? Math.sin(player.angle) : next.y
            withInput((state) => setVirtualAim(state.input, angleX, angleY, !player.buildMode))
          }}
          onPointerMove={(event) => {
            if (aimPointerIdRef.current !== event.pointerId) return
            event.preventDefault()
            const next = clampStick(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect())
            withInput((state) => setVirtualAim(state.input, next.x, next.y, !player.buildMode))
          }}
          onPointerUp={(event) => {
            if (aimPointerIdRef.current !== event.pointerId) return
            event.preventDefault()
            aimPointerIdRef.current = null
            event.currentTarget.releasePointerCapture(event.pointerId)
            withInput((state) => clearVirtualAim(state.input))
          }}
          onPointerCancel={(event) => {
            if (aimPointerIdRef.current !== event.pointerId) return
            aimPointerIdRef.current = null
            withInput((state) => clearVirtualAim(state.input))
          }}
        >
          <div className="pointer-events-none flex h-12 w-12 items-center justify-center rounded-full border border-[rgba(255,255,255,0.16)] bg-[rgba(255,255,255,0.08)]">
            <Crosshair className="h-5 w-5 text-[rgba(255,255,255,0.8)]" />
          </div>
        </div>
      </div>

      <div className="absolute right-4 bottom-40 grid grid-cols-2 gap-2">
        <ActionButton
          label={interactLabel}
          testId="mobile-action-interact"
          icon={player.buildMode ? <RotateCw className="h-4 w-4" /> : <PackageOpen className="h-4 w-4" />}
          onHoldStart={() => {
            withInput((state) => {
              if (player.buildMode) {
                tapVirtualKey(state.input, 'e')
                return
              }
              setVirtualKeyHeld(state.input, 'e', true)
            })
          }}
          onHoldEnd={() => {
            if (player.buildMode) return
            withInput((state) => setVirtualKeyHeld(state.input, 'e', false))
          }}
        />
        <ActionButton
          label={player.buildMode ? 'Place' : 'Reload'}
          testId="mobile-action-primary"
          icon={player.buildMode ? <Hammer className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}
          onTap={() => {
            withInput((state) => {
              if (player.buildMode) {
                tapVirtualClick(state.input)
                return
              }
              tapVirtualKey(state.input, 'r')
            })
          }}
        />
        <ActionButton
          label="Heal"
          testId="mobile-action-heal"
          icon={<HeartPulse className="h-4 w-4" />}
          onTap={() => {
            withInput((state) => tapVirtualKey(state.input, 'f'))
          }}
        />
        <ActionButton
          label={player.buildMode ? 'Exit' : 'Build'}
          testId="mobile-action-build"
          icon={<Hammer className="h-4 w-4" />}
          onTap={() => {
            withInput((state) => tapVirtualKey(state.input, 'b'))
          }}
        />
      </div>
    </div>
  )
}
