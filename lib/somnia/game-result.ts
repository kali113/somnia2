import { buildBackendApiUrl, isBackendConfigured } from './runtime-config'

export interface GameResultPayload {
  gameId: number
  placements: string[]   // ordered addresses, index 0 = winner
  kills: number[]        // parallel to placements
}

export interface GameResultResponse {
  success: boolean
  txHash: string | null
  error: string | null
}

/**
 * Submit a match-mode game result to the backend.
 * The backend orchestrator wallet will call submitGameResult() on-chain.
 */
export async function submitGameResult(
  payload: GameResultPayload,
): Promise<GameResultResponse> {
  if (!isBackendConfigured) {
    return { success: false, txHash: null, error: 'Backend not configured' }
  }

  const url = buildBackendApiUrl('/api/game/result')
  if (!url) {
    return { success: false, txHash: null, error: 'Could not build backend URL' }
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      return {
        success: false,
        txHash: null,
        error: (body as Record<string, unknown>).error as string ?? `HTTP ${res.status}`,
      }
    }

    const body = await res.json() as Record<string, unknown>
    return {
      success: Boolean(body.success),
      txHash: (body.txHash as string) ?? null,
      error: null,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, txHash: null, error: message }
  }
}

/**
 * Generate a deterministic placeholder address for a bot.
 * Uses a simple scheme: 0xB07 + zero-padded botIndex + zero-padded gameId
 * These addresses are not real wallets; they just fill the placements array.
 */
export function botPlaceholderAddress(gameId: number, botIndex: number): string {
  const gameHex = (gameId & 0xFFFFFFFF).toString(16).padStart(8, '0')
  const botHex = (botIndex & 0xFFFF).toString(16).padStart(4, '0')
  // 0xB07<botHex><gameHex> + zero-pad to 40 hex chars (20 bytes)
  const raw = `B07${botHex}${gameHex}`
  return `0x${raw.padStart(40, '0')}`
}
