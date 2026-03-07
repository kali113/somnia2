import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { formatEther, isAddress, parseEther, type Address } from 'viem'

const SESSION_KEY = 'pixel_royale_session'
export const SESSION_UPDATED_EVENT = 'pixel-royale-session-updated'
export const DEFAULT_SESSION_DURATION_MS = 60 * 60_000
export const SESSION_MIN_REMAINING_MS = 20 * 60_000

export interface SessionWallet {
  address: Address
  expiry: number // unix timestamp in ms
}

interface StoredSession {
  address: string
  expiry: number
}

function isStoredSession(value: unknown): value is StoredSession {
  return typeof value === 'object'
    && value !== null
    && 'address' in value
    && typeof value.address === 'string'
    && 'expiry' in value
    && typeof value.expiry === 'number'
}

function notifySessionUpdated(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SESSION_UPDATED_EVENT))
  }
}

/**
 * Create a short-lived session approval address.
 *
 * The signer key is not persisted in browser storage. Only the approved
 * address and expiry are stored so the UI can track the session state.
 */
export function createSessionWallet(durationMs: number = DEFAULT_SESSION_DURATION_MS): SessionWallet {
  const account = privateKeyToAccount(generatePrivateKey())
  const session: SessionWallet = {
    address: account.address,
    expiry: Date.now() + durationMs,
  }

  if (typeof window !== 'undefined') {
    const stored: StoredSession = {
      address: session.address,
      expiry: session.expiry,
    }
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(stored))
    notifySessionUpdated()
  }

  return session
}

/**
 * Restore the short-lived session approval state if it still exists.
 */
export function restoreSessionWallet(): SessionWallet | null {
  if (typeof window === 'undefined') {return null}

  const raw = sessionStorage.getItem(SESSION_KEY)
  if (!raw) {return null}

  try {
    const stored = JSON.parse(raw) as unknown
    if (!isStoredSession(stored)) {
      destroySessionWallet()
      return null
    }

    if (!isAddress(stored.address) || Date.now() >= stored.expiry) {
      destroySessionWallet()
      return null
    }

    return {
      address: stored.address,
      expiry: stored.expiry,
    }
  } catch {
    destroySessionWallet()
    return null
  }
}

/**
 * Destroy the stored session approval state.
 */
export function destroySessionWallet(): void {
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem(SESSION_KEY)
    notifySessionUpdated()
  }
}

/**
 * Get the session expiry timestamp for on-chain approval.
 * Returns a Unix timestamp in seconds.
 */
export function getSessionExpirySolidity(session: SessionWallet): bigint {
  return BigInt(Math.floor(session.expiry / 1000))
}

/**
 * Check if user has enough STT for gas during a game session.
 * Estimated: ~0.005 STT for a full game session of transactions.
 */
export const MIN_STT_FOR_SESSION = parseEther('0.005')

export function formatSTT(wei: bigint): string {
  return formatEther(wei)
}
