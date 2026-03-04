import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts'
import { createWalletClient, http, formatEther, parseEther, type WalletClient } from 'viem'
import { somniaTestnet } from '@/lib/wagmi-config'
import { SOMNIA_RPC_URL } from '@/lib/somnia/config'

const SESSION_KEY = 'pixel_royale_session'
export const SESSION_UPDATED_EVENT = 'pixel-royale-session-updated'

export interface SessionWallet {
  account: PrivateKeyAccount
  client: WalletClient
  privateKey: `0x${string}`
  expiry: number // unix timestamp
}

interface StoredSession {
  privateKey: string
  expiry: number
}

function notifySessionUpdated(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SESSION_UPDATED_EVENT))
  }
}

/**
 * Create a new session wallet.
 * Generates an ephemeral private key stored in sessionStorage.
 * The session lasts for `durationMs` (default 1 hour).
 */
export function createSessionWallet(durationMs: number = 3600_000): SessionWallet {
  const privateKey = generatePrivateKey()
  const account = privateKeyToAccount(privateKey)
  const expiry = Date.now() + durationMs

  const client = createWalletClient({
    account,
    chain: somniaTestnet,
    transport: http(SOMNIA_RPC_URL),
  })

  // Store in sessionStorage (cleared when tab closes)
  if (typeof window !== 'undefined') {
    const stored: StoredSession = { privateKey, expiry }
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(stored))
    notifySessionUpdated()
  }

  return { account, client, privateKey, expiry }
}

/**
 * Restore a session wallet from sessionStorage if it exists and hasn't expired.
 */
export function restoreSessionWallet(): SessionWallet | null {
  if (typeof window === 'undefined') return null

  const raw = sessionStorage.getItem(SESSION_KEY)
  if (!raw) return null

  try {
    const stored: StoredSession = JSON.parse(raw)

    if (Date.now() >= stored.expiry) {
      destroySessionWallet()
      return null
    }

    const privateKey = stored.privateKey as `0x${string}`
    const account = privateKeyToAccount(privateKey)
    const client = createWalletClient({
      account,
      chain: somniaTestnet,
      transport: http(SOMNIA_RPC_URL),
    })

    return { account, client, privateKey, expiry: stored.expiry }
  } catch {
    destroySessionWallet()
    return null
  }
}

/**
 * Destroy the session wallet (clears sessionStorage).
 */
export function destroySessionWallet(): void {
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem(SESSION_KEY)
    notifySessionUpdated()
  }
}

/**
 * Get the session expiry timestamp for on-chain approval.
 * Returns a Unix timestamp in seconds (for Solidity).
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
