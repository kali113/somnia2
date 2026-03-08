import { isAddress, type Address } from 'viem'
import deployment from '@/contracts/deployments/somnia-shannon-50312.json'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
const FALLBACK_DEAD_ADDRESS = '0x000000000000000000000000000000000000dEaD' as Address
const DEPLOYED_PIXEL_ROYALE_ADDRESS =
  (deployment.contract?.address || ZERO_ADDRESS) as Address

function normalizeUrl(value: string): string {
  return value.replace(/\/+$/, '')
}

/**
 * Detect whether the frontend is served from the same origin as the backend.
 * When nginx serves both the static site and proxies /api/* and /ws/*,
 * we can use relative URLs (same-origin mode) — no explicit backend URL needed.
 */
function detectSameOrigin(): boolean {
  if (typeof window === 'undefined') {return false}
  const host = window.location.hostname
  // localhost dev server with backend on :3001 is NOT same-origin
  if (host === 'localhost' || host === '127.0.0.1') {return false}
  // GitHub Pages is NOT same-origin (no backend there)
  if (host.endsWith('.github.io')) {return false}
  // Everything else (VM IP, CF tunnel, custom domain) IS same-origin
  // because nginx proxies /api/* and /ws/* to the backend
  return true
}

function detectLocalBackendUrl(): string {
  if (typeof window === 'undefined') {return ''}
  const host = window.location.hostname
  if (host === 'localhost' || host === '127.0.0.1') {
    return `http://${host}:3001`
  }
  return ''
}

function validateBackendUrl(value: string): string | null {
  if (!value) {return null}

  try {
    const parsed = new URL(value)
    const pathname = parsed.pathname.replace(/\/+$/, '')
    const normalized = `${parsed.origin}${pathname === '/' ? '' : pathname}`

    if (parsed.protocol === 'https:') {
      return normalized
    }

    if (parsed.protocol === 'http:' && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')) {
      return normalized
    }

    return null
  } catch {
    return null
  }
}

function deriveWsUrl(): string | null {
  if (typeof window === 'undefined') {return null}
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}/ws/queue`
}

// ── Contract config ─────────────────────────────────────────────────────────

const configuredContractEnv = (
  process.env.NEXT_PUBLIC_PIXEL_ROYALE_ADDRESS ||
  process.env.NEXT_PUBLIC_GAME_CONTRACT_ADDRESS ||
  ''
).trim()

const contractEnv = configuredContractEnv || DEPLOYED_PIXEL_ROYALE_ADDRESS
const contractIsAddress = isAddress(contractEnv)
const contractIsZero = contractEnv.toLowerCase() === ZERO_ADDRESS

export const isContractConfigured = contractIsAddress && !contractIsZero
export const contractConfigError = isContractConfigured
  ? null
  : 'Contract not deployed — on-chain features unavailable.'

export const configuredContractAddress: Address | null = isContractConfigured
  ? (contractEnv as Address)
  : null

// Keep a non-routable typed fallback for hooks while disabled.
export const contractAddressOrFallback: Address = configuredContractAddress || FALLBACK_DEAD_ADDRESS

// ── Backend config ──────────────────────────────────────────────────────────

const explicitBackendUrl = normalizeUrl((process.env.NEXT_PUBLIC_BACKEND_URL || '').trim())
const validatedExplicitUrl = validateBackendUrl(explicitBackendUrl)
const localUrl = validateBackendUrl(normalizeUrl(detectLocalBackendUrl()))
const sameOrigin = detectSameOrigin()

// Priority: explicit env var > localhost detection > same-origin mode
const resolvedBackendUrl: string | null = validatedExplicitUrl ?? localUrl ?? (sameOrigin ? '' : null)

export const isBackendConfigured = resolvedBackendUrl !== null
export const backendConfigError = isBackendConfigured
  ? null
  : 'Backend unreachable. Open the game from the server URL (not GitHub Pages).'

// In same-origin mode, backendHttpUrl is '' (empty string).
// buildBackendApiUrl will return relative paths like '/api/foo'.
export const backendHttpUrl: string | null = resolvedBackendUrl

export const backendWsUrl: string | null = (() => {
  if (resolvedBackendUrl === null) {return null}
  // Same-origin mode: derive WS URL from window.location
  if (resolvedBackendUrl === '') {return deriveWsUrl()}
  // Explicit URL: convert http(s) to ws(s)
  const wsBase = resolvedBackendUrl.startsWith('https://')
    ? resolvedBackendUrl.replace(/^https/i, 'wss')
    : resolvedBackendUrl.replace(/^http/i, 'ws')
  return `${wsBase}/ws/queue`
})()

export function buildBackendApiUrl(path: string): string | null {
  if (resolvedBackendUrl === null) {return null}
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  // Same-origin mode: return relative path (e.g. '/api/matchmaking/queue')
  // Explicit URL: return full URL (e.g. 'https://example.com/api/matchmaking/queue')
  return `${resolvedBackendUrl}${normalizedPath}`
}
