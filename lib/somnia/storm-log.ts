'use client'

import type { StormCommitRequest } from '@/lib/game/engine'
import type { StormCircleCommit } from '@/lib/game/storm'
import { buildBackendApiUrl } from './runtime-config'

interface StormCommitResponse {
  txHash: string | null
  commit?: StormCircleCommit
  reason?: string
}

export async function commitStormCircleOnChain(
  request: StormCommitRequest,
): Promise<StormCommitResponse> {
  const url = buildBackendApiUrl('/api/game/storm')
  if (!url) {
    return { txHash: null, reason: 'backend_not_configured' }
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
      cache: 'no-store',
    })

    const payload = await res.json() as StormCommitResponse & { error?: string }
    if (!res.ok) {
      return {
        txHash: payload.txHash ?? null,
        commit: payload.commit,
        reason: payload.reason ?? payload.error ?? `http_${res.status}`,
      }
    }

    return payload
  } catch {
    return { txHash: null, reason: 'request_failed' }
  }
}
