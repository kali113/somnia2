import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { createWalletClient, formatEther, http, isAddress, parseEther, type Address } from 'viem'
import { SOMNIA_RPC_URL, SOMNIA_TESTNET } from './config'

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
  privateKey: string
  expiry: number
}

function isStoredSession(value: unknown): value is StoredSession {
  return typeof value === 'object'
    && value !== null
    && 'address' in value
    && typeof value.address === 'string'
    && 'privateKey' in value
    && typeof value.privateKey === 'string'
    && 'expiry' in value
    && typeof value.expiry === 'number'
}

function notifySessionUpdated(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SESSION_UPDATED_EVENT))
  }
}

/**
 * Create a short-lived session wallet with a stored private key.
 * The private key is persisted in sessionStorage so it can sign
 * in-game transactions without prompting the user's main wallet.
 */
export function createSessionWallet(durationMs: number = DEFAULT_SESSION_DURATION_MS): SessionWallet {
  const privateKey = generatePrivateKey()
  const account = privateKeyToAccount(privateKey)
  const session: SessionWallet = {
    address: account.address,
    expiry: Date.now() + durationMs,
  }

  if (typeof window !== 'undefined') {
    const stored: StoredSession = {
      address: session.address,
      privateKey,
      expiry: session.expiry,
    }
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(stored))
    notifySessionUpdated()
  }

  return session
}

/**
 * Restore the session wallet state (address + expiry) for UI display.
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
 * Get a viem WalletClient backed by the session wallet's private key.
 * Returns null if no valid session exists.
 */
export function getSessionWalletClient() {
  if (typeof window === 'undefined') {return null}

  const raw = sessionStorage.getItem(SESSION_KEY)
  if (!raw) {return null}

  try {
    const stored = JSON.parse(raw) as unknown
    if (!isStoredSession(stored)) {return null}
    if (!isAddress(stored.address) || Date.now() >= stored.expiry) {return null}

    const account = privateKeyToAccount(stored.privateKey as `0x${string}`)
    return createWalletClient({
      account,
      chain: SOMNIA_TESTNET,
      transport: http(SOMNIA_RPC_URL),
    })
  } catch {
    return null
  }
}

/**
 * Destroy the stored session wallet.
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
