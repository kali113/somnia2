import { isAddress, type Address } from 'viem'
import deployment from '@/contracts/deployments/somnia-shannon-50312.json'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
const FALLBACK_DEAD_ADDRESS = '0x000000000000000000000000000000000000dEaD' as Address
const DEPLOYED_PIXEL_ROYALE_ADDRESS =
  (deployment.contract?.address || ZERO_ADDRESS) as Address

function normalizeUrl(value: string): string {
  return value.replace(/\/+$/, '')
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//.test(value)
}

function toWsUrl(httpUrl: string): string {
  return httpUrl.replace(/^http/i, 'ws')
}

function detectLocalBackendUrl(): string {
  if (typeof window === 'undefined') return ''
  const host = window.location.hostname
  if (host === 'localhost' || host === '127.0.0.1') {
    return `http://${host}:3001`
  }
  return ''
}

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

const backendEnv = normalizeUrl((process.env.NEXT_PUBLIC_BACKEND_URL || detectLocalBackendUrl()).trim())
const backendValid = backendEnv.length > 0 && isHttpUrl(backendEnv)

export const isBackendConfigured = backendValid
export const backendConfigError = isBackendConfigured
  ? null
  : 'Missing NEXT_PUBLIC_BACKEND_URL (must start with http:// or https://).'

export const backendHttpUrl: string | null = isBackendConfigured ? backendEnv : null
export const backendWsUrl: string | null = isBackendConfigured ? `${toWsUrl(backendEnv)}/ws/queue` : null

export function buildBackendApiUrl(path: string): string | null {
  if (!backendHttpUrl) return null
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${backendHttpUrl}${normalizedPath}`
}
