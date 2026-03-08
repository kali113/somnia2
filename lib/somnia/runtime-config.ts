import { isAddress, type Address } from 'viem'
import deployment from '@/contracts/deployments/somnia-shannon-50312.json'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
const FALLBACK_DEAD_ADDRESS = '0x000000000000000000000000000000000000dEaD' as Address
const DEPLOYED_PIXEL_ROYALE_ADDRESS =
  (deployment.contract?.address || ZERO_ADDRESS) as Address

/**
 * Public Gist that holds the current CF tunnel URL.
 * Updated automatically by the VM tunnel-start script.
 */
const BACKEND_URL_GIST =
  'https://gist.githubusercontent.com/matoscmanceron-collab/ad6fdfac579afd74a797613efaf483ea/raw/backend-url.json'

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

function deriveWsUrl(base: string): string | null {
  // Same-origin mode: derive from window.location
  if (base === '') {
    if (typeof window === 'undefined') {return null}
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${proto}//${window.location.host}/ws/queue`
  }
  // Explicit URL: convert http(s) to ws(s)
  const wsBase = base.startsWith('https://')
    ? base.replace(/^https/i, 'wss')
    : base.replace(/^http/i, 'ws')
  return `${wsBase}/ws/queue`
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

// ── Backend config (mutable — updated by fetchBackendUrl) ───────────────────

const explicitBackendUrl = normalizeUrl((process.env.NEXT_PUBLIC_BACKEND_URL || '').trim())
const validatedExplicitUrl = validateBackendUrl(explicitBackendUrl)
const localUrl = validateBackendUrl(normalizeUrl(detectLocalBackendUrl()))
const sameOrigin = detectSameOrigin()

// Priority: explicit env var > localhost detection > same-origin mode > null
let resolvedBackendUrl: string | null = validatedExplicitUrl ?? localUrl ?? (sameOrigin ? '' : null)
let _backendInitDone = resolvedBackendUrl !== null

export let isBackendConfigured = resolvedBackendUrl !== null
export let backendConfigError: string | null = isBackendConfigured
  ? null
  : 'Backend unreachable. Open the game from the server URL (not GitHub Pages).'
export let backendHttpUrl: string | null = resolvedBackendUrl
export let backendWsUrl: string | null = resolvedBackendUrl !== null ? deriveWsUrl(resolvedBackendUrl) : null

export function buildBackendApiUrl(path: string): string | null {
  if (resolvedBackendUrl === null) {return null}
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${resolvedBackendUrl}${normalizedPath}`
}

/**
 * Fetch the backend URL from the public Gist (for GitHub Pages).
 * Called once on app init. No-ops if a backend is already configured.
 */
export async function fetchBackendUrl(): Promise<void> {
  if (_backendInitDone) {return}
  _backendInitDone = true

  try {
    const res = await fetch(BACKEND_URL_GIST, { cache: 'no-store' })
    if (!res.ok) {return}
    const data = await (res.json() as Promise<{ url?: string }>)
    const url = typeof data.url === 'string' ? normalizeUrl(data.url.trim()) : ''
    const validated = validateBackendUrl(url)
    if (!validated) {return}

    resolvedBackendUrl = validated
    isBackendConfigured = true
    backendConfigError = null
    backendHttpUrl = validated
    backendWsUrl = deriveWsUrl(validated)
  } catch {
    // Gist fetch failed — leave backend unconfigured
  }
}
