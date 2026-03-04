import { SOMNIA_TESTNET } from './config'

interface RpcBlockPayload {
  hash?: string | null
  mixHash?: string | null
  number?: string | null
}

const MAX_INT31 = BigInt(0x7fffffff)

function fallbackSeed(): number {
  return Math.max(1, Date.now() % 0x7fffffff)
}

function normalizeSeed(rawHex: string): number {
  const value = BigInt(rawHex)
  const localEntropy = typeof crypto !== 'undefined'
    ? crypto.getRandomValues(new Uint32Array(1))[0]
    : Math.floor(Math.random() * 0xffffffff)
  const mixed = Number((value ^ BigInt(localEntropy)) & MAX_INT31)
  return Math.max(1, mixed)
}

export async function fetchSomniaRandomSeed(timeoutMs = 2200): Promise<number> {
  const rpcUrl = SOMNIA_TESTNET.rpcUrls.default.http[0]
  if (!rpcUrl) return fallbackSeed()

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_getBlockByNumber',
        params: ['latest', false],
      }),
      signal: controller.signal,
      cache: 'no-store',
    })

    if (!res.ok) return fallbackSeed()
    const payload = await res.json() as { result?: RpcBlockPayload }
    const block = payload.result
    const entropyHex = block?.mixHash || block?.hash || null
    if (!entropyHex || typeof entropyHex !== 'string' || !entropyHex.startsWith('0x')) {
      return fallbackSeed()
    }
    return normalizeSeed(entropyHex)
  } catch {
    return fallbackSeed()
  } finally {
    clearTimeout(timer)
  }
}
