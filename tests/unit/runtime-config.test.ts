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
        location: {
          hostname: options.hostname,
          protocol: 'https:',
          host: options.hostname,
        },
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

  it('rejects insecure remote http backends when explicit', async () => {
    const config = await loadRuntimeConfig({
      backendUrl: 'http://api.pixel.test',
    })

    // Explicit insecure URL rejected, but SSR has no window so no same-origin fallback
    expect(config.isBackendConfigured).toBe(false)
    expect(config.backendHttpUrl).toBeNull()
    expect(config.backendWsUrl).toBeNull()
    expect(config.buildBackendApiUrl('/api/health')).toBeNull()
    expect(config.backendConfigError).toMatch(/Backend unreachable/)
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

  it('uses same-origin mode for non-local, non-GitHub-Pages hosts', async () => {
    const config = await loadRuntimeConfig({
      hostname: 'pixel.example',
    })

    // Same-origin mode: frontend served from same host as backend via nginx proxy
    expect(config.isBackendConfigured).toBe(true)
    expect(config.backendHttpUrl).toBe('')
    expect(config.buildBackendApiUrl('/api/health')).toBe('/api/health')
  })

  it('does not auto-detect a backend for GitHub Pages', async () => {
    const config = await loadRuntimeConfig({
      hostname: 'kali113.github.io',
    })

    expect(config.isBackendConfigured).toBe(false)
    expect(config.backendHttpUrl).toBeNull()
  })

  it('does not auto-detect a backend during server-side execution', async () => {
    const config = await loadRuntimeConfig()

    expect(config.isBackendConfigured).toBe(false)
    expect(config.backendHttpUrl).toBeNull()
  })

  it('fetchBackendUrl resolves backend from Gist on GitHub Pages', async () => {
    const config = await loadRuntimeConfig({
      hostname: 'kali113.github.io',
    })

    expect(config.isBackendConfigured).toBe(false)

    // Mock the Gist fetch
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ url: 'https://test-tunnel.trycloudflare.com/' }),
    })
    vi.stubGlobal('fetch', mockFetch)

    await config.fetchBackendUrl()

    expect(config.isBackendConfigured).toBe(true)
    expect(config.backendHttpUrl).toBe('https://test-tunnel.trycloudflare.com')
    expect(config.backendWsUrl).toBe('wss://test-tunnel.trycloudflare.com/ws/queue')
    expect(config.buildBackendApiUrl('/api/health')).toBe('https://test-tunnel.trycloudflare.com/api/health')

    vi.unstubAllGlobals()
  })

  it('fetchBackendUrl no-ops when backend is already configured', async () => {
    const config = await loadRuntimeConfig({
      backendUrl: 'https://existing.test',
    })

    expect(config.isBackendConfigured).toBe(true)

    const mockFetch = vi.fn()
    vi.stubGlobal('fetch', mockFetch)

    await config.fetchBackendUrl()

    // Should not have fetched — already configured
    expect(mockFetch).not.toHaveBeenCalled()

    vi.unstubAllGlobals()
  })

  it('fetchBackendUrl handles fetch failure gracefully', async () => {
    const config = await loadRuntimeConfig({
      hostname: 'kali113.github.io',
    })

    const mockFetch = vi.fn().mockRejectedValue(new Error('network error'))
    vi.stubGlobal('fetch', mockFetch)

    await config.fetchBackendUrl()

    expect(config.isBackendConfigured).toBe(false)

    vi.unstubAllGlobals()
  })

  it('fetchBackendUrl ignores non-ok responses', async () => {
    const config = await loadRuntimeConfig({
      hostname: 'kali113.github.io',
    })

    const mockFetch = vi.fn().mockResolvedValue({ ok: false })
    vi.stubGlobal('fetch', mockFetch)

    await config.fetchBackendUrl()

    expect(config.isBackendConfigured).toBe(false)

    vi.unstubAllGlobals()
  })

  it('fetchBackendUrl ignores invalid URLs from Gist', async () => {
    const config = await loadRuntimeConfig({
      hostname: 'kali113.github.io',
    })

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ url: 'http://insecure.example.com' }),
    })
    vi.stubGlobal('fetch', mockFetch)

    await config.fetchBackendUrl()

    expect(config.isBackendConfigured).toBe(false)

    vi.unstubAllGlobals()
  })
})
