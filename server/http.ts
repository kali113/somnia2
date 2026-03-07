import type {
  Application,
  NextFunction,
  Request,
  RequestHandler,
  Response,
} from 'express'
import type {
  Address,
  PublicClient,
  WalletClient,
} from 'viem'

import type { GameStore } from './store.js'

export interface ServerAppLocals {
  contractAddress: Address
  orchestratorApiToken: string
  orchestratorClient: WalletClient | null
  publicClient: PublicClient
  store: GameStore
}

type ServerApplication = Application & {
  locals: ServerAppLocals
}

export function setServerLocals(app: Application, locals: ServerAppLocals): void {
  Object.assign((app as ServerApplication).locals, locals)
}

export function getServerLocals(req: Request): ServerAppLocals {
  return (req.app as ServerApplication).locals
}

export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown> | undefined,
): RequestHandler {
  return (req, res, next) => {
    void Promise.resolve(handler(req, res, next)).catch(next)
  }
}
