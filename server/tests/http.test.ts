import express, {
  type NextFunction,
  type Request,
  type Response,
} from 'express'
import { describe, expect, it, vi } from 'vitest'
import type {
  Address,
  PublicClient,
} from 'viem'

import {
  asyncHandler,
  getServerLocals,
  setServerLocals,
} from '../http.js'
import { GameStore } from '../store.js'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

describe('server http helpers', () => {
  it('stores and retrieves typed locals from an express app', () => {
    const app = express()
    const store = new GameStore()

    setServerLocals(app, {
      contractAddress: ZERO_ADDRESS,
      orchestratorApiToken: 'token',
      orchestratorClient: null,
      publicClient: {} as PublicClient,
      store,
    })

    const locals = getServerLocals({ app } as unknown as Request)

    expect(locals.contractAddress).toBe(ZERO_ADDRESS)
    expect(locals.orchestratorApiToken).toBe('token')
    expect(locals.store).toBe(store)
  })

  it('passes async failures to next', async () => {
    const next = vi.fn<(error?: unknown) => void>()
    const error = new Error('boom')
    const handler = asyncHandler(() => Promise.reject(error))

    handler({} as Request, {} as Response, next as NextFunction)
    await flushMicrotasks()

    expect(next).toHaveBeenCalledWith(error)
  })

  it('does not call next for successful handlers', async () => {
    const next = vi.fn<(error?: unknown) => void>()
    const handler = asyncHandler(() => undefined)

    handler({} as Request, {} as Response, next as NextFunction)
    await flushMicrotasks()

    expect(next).not.toHaveBeenCalled()
  })
})
