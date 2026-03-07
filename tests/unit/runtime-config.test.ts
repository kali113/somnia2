import { afterEach, describe, expect, it, vi } from 'vitest'

const BACKEND_ENV = 'NEXT_PUBLIC_BACKEND_URL'
const CONTRACT_ENV = 'NEXT_PUBLIC_PIXEL_ROYALE_ADDRESS'
const GAME_CONTRACT_ENV = 'NEXT_PUBLIC_GAME_CONTRACT_ADDRESS'
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')

function restoreWindow(): void {
  if (originalWindow) {
    Object.defineProperty(globalThis, 'window', originalWindow)
    return
  }

  Reflect.deleteProperty(globalThis, 'window')
}

async function loadRuntimeConfig(options?: {
  backendUrl?: string
  contractAddress?: string
  hostname?: string
}) {
  vi.resetModules()

  Reflect.deleteProperty(process.env, BACKEND_ENV)
  Reflect.deleteProperty(process.env, CONTRACT_ENV)
  Reflect.deleteProperty(process.env, GAME_CONTRACT_ENV)

  if (options?.backendUrl !== undefined) {
    process.env[BACKEND_ENV] = options.backendUrl
  }

  if (options?.contractAddress !== undefined) {
    process.env[CONTRACT_ENV] = options.contractAddress
  }

  if (options?.hostname) {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        location: { hostname: options.hostname },
      },
    })
  } else {
    restoreWindow()
  }

  return await import('@/lib/somnia/runtime-config')
}

afterEach(() => {
  Reflect.deleteProperty(process.env, BACKEND_ENV)
  Reflect.deleteProperty(process.env, CONTRACT_ENV)
  Reflect.deleteProperty(process.env, GAME_CONTRACT_ENV)
  restoreWindow()
  vi.resetModules()
})

describe('runtime backend configuration', () => {
  it('accepts secure backends and derives websocket plus API URLs', async () => {
    const config = await loadRuntimeConfig({
      backendUrl: 'https://api.pixel.test/base///',
    })

    expect(config.isBackendConfigured).toBe(true)
    expect(config.backendHttpUrl).toBe('https://api.pixel.test/base')
    expect(config.backendWsUrl).toBe('wss://api.pixel.test/base/ws/queue')
    expect(config.buildBackendApiUrl('/api/health')).toBe('https://api.pixel.test/base/api/health')
    expect(config.isContractConfigured).toBe(true)
  })

  it('normalizes secure root-path backends without a trailing slash', async () => {
    const config = await loadRuntimeConfig({
      backendUrl: 'https://api.pixel.test/',
    })

    expect(config.backendHttpUrl).toBe('https://api.pixel.test')
    expect(config.buildBackendApiUrl('api/health')).toBe('https://api.pixel.test/api/health')
  })

  it('accepts localhost http backends and normalizes paths', async () => {
    const config = await loadRuntimeConfig({
      backendUrl: 'http://localhost:3001///',
    })

    expect(config.isBackendConfigured).toBe(true)
    expect(config.backendHttpUrl).toBe('http://localhost:3001')
    expect(config.backendWsUrl).toBe('ws://localhost:3001/ws/queue')
    expect(config.buildBackendApiUrl('api/matchmaking/queue')).toBe('http://localhost:3001/api/matchmaking/queue')
  })

  it('rejects insecure remote http backends', async () => {
    const config = await loadRuntimeConfig({
      backendUrl: 'http://api.pixel.test',
    })

    expect(config.isBackendConfigured).toBe(false)
    expect(config.backendHttpUrl).toBeNull()
    expect(config.backendWsUrl).toBeNull()
    expect(config.buildBackendApiUrl('/api/health')).toBeNull()
    expect(config.backendConfigError).toMatch(/NEXT_PUBLIC_BACKEND_URL/)
  })

  it('rejects malformed backend URLs', async () => {
    const config = await loadRuntimeConfig({
      backendUrl: '://definitely-not-a-url',
    })

    expect(config.isBackendConfigured).toBe(false)
    expect(config.backendHttpUrl).toBeNull()
    expect(config.backendWsUrl).toBeNull()
  })

  it('auto-detects a local browser backend and honors a zero-address override', async () => {
    const config = await loadRuntimeConfig({
      contractAddress: ZERO_ADDRESS,
      hostname: '127.0.0.1',
    })

    expect(config.isBackendConfigured).toBe(true)
    expect(config.backendHttpUrl).toBe('http://127.0.0.1:3001')
    expect(config.backendWsUrl).toBe('ws://127.0.0.1:3001/ws/queue')
    expect(config.isContractConfigured).toBe(false)
    expect(config.configuredContractAddress).toBeNull()
    expect(config.contractAddressOrFallback).toBe('0x000000000000000000000000000000000000dEaD')
  })

  it('does not auto-detect a backend for non-local hosts', async () => {
    const config = await loadRuntimeConfig({
      hostname: 'pixel.example',
    })

    expect(config.isBackendConfigured).toBe(false)
    expect(config.backendHttpUrl).toBeNull()
  })

  it('does not auto-detect a backend during server-side execution', async () => {
    const config = await loadRuntimeConfig()

    expect(config.isBackendConfigured).toBe(false)
    expect(config.backendHttpUrl).toBeNull()
  })
})
