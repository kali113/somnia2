import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import { WebSocketServer, WebSocket } from 'ws'
import http from 'http'
import { spawn } from 'node:child_process'
import { timingSafeEqual } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { Duplex } from 'node:stream'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http as viemHttp,
  isAddress,
  parseAbi,
  type Address,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { playerRouter } from './routes/player.js'
import { queueRouter } from './routes/queue.js'
import { gameRouter } from './routes/game.js'
import { leaderboardRouter } from './routes/leaderboard.js'
import { matchmakingRouter } from './routes/matchmaking.js'
import { asyncHandler, setServerLocals } from './http.js'
import { Indexer, type IndexedEvent } from './indexer.js'
import { GameStore } from './store.js'

const runtimeDir = path.dirname(fileURLToPath(import.meta.url))
const serverRoot = path.basename(runtimeDir) === 'dist'
  ? path.resolve(runtimeDir, '..')
  : runtimeDir
const projectRoot = path.resolve(serverRoot, '..')

dotenv.config({ path: path.join(projectRoot, '.env'), quiet: true })
dotenv.config({ path: path.join(projectRoot, '.env.local'), override: true, quiet: true })
dotenv.config({ path: path.join(serverRoot, '.env'), override: true, quiet: true })
dotenv.config({ path: path.join(serverRoot, '.env.local'), override: true, quiet: true })

const ZERO_ADDRESS: Address = '0x0000000000000000000000000000000000000000'
const ZERO_PRIVATE_KEY = `0x${'0'.repeat(64)}`
const FORCE_START_ABI = parseAbi(['function forceStartGame()'])

function readDeploymentContractAddress(): string {
  try {
    const deploymentPath = path.join(projectRoot, 'contracts', 'deployments', 'somnia-shannon-50312.json')
    const raw = readFileSync(deploymentPath, 'utf8')
    const payload = JSON.parse(raw) as { contract?: { address?: string } }
    return (payload.contract?.address || '').trim()
  } catch {
    return ''
  }
}

// ── Environment ─────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '3001', 10)
const SOMNIA_RPC = process.env.SOMNIA_RPC_URL || 'https://dream-rpc.somnia.network'
const DEPLOYED_CONTRACT_ADDRESS = readDeploymentContractAddress()
const rawContractAddress = (
  process.env.GAME_CONTRACT_ADDRESS ||
  process.env.NEXT_PUBLIC_PIXEL_ROYALE_ADDRESS ||
  process.env.NEXT_PUBLIC_GAME_CONTRACT_ADDRESS ||
  DEPLOYED_CONTRACT_ADDRESS ||
  ZERO_ADDRESS
).trim()
const CONTRACT_ADDRESS: Address = isAddress(rawContractAddress) ? rawContractAddress : ZERO_ADDRESS
const CONTRACT_CONFIGURED = CONTRACT_ADDRESS.toLowerCase() !== ZERO_ADDRESS
const ORCHESTRATOR_KEY = (
  process.env.ORCHESTRATOR_PRIVATE_KEY ||
  process.env.SOMNIA_DEPLOYER_PRIVATE_KEY
) as `0x${string}` | undefined
const ORCHESTRATOR_API_TOKEN = (process.env.ORCHESTRATOR_API_TOKEN || '').trim()
const REDEPLOY_PASSWORD = (process.env.REDEPLOY_PASSWORD || '').trim()
const REDEPLOY_SERVICE = (process.env.REDEPLOY_SERVICE || 'somnia2-force-deploy.service').trim()
const MAX_WS_CLIENTS = parseInt(process.env.MAX_WS_CLIENTS || '100', 10)
const configuredCorsOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean)
const CORS_ORIGINS = configuredCorsOrigins.length > 0
  ? configuredCorsOrigins
  : [
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://localhost:3002',
      'http://127.0.0.1:3002',
      'http://188.166.47.230',
      'https://188.166.47.230',
      'https://kali113.github.io',
    ]

// ── Somnia chain definition ─────────────────────────────────────────────────
const somniaTestnet = defineChain({
  id: 50312,
  name: 'Somnia Testnet',
  nativeCurrency: { name: 'Somnia Test Token', symbol: 'STT', decimals: 18 },
  rpcUrls: { default: { http: [SOMNIA_RPC] } },
  blockExplorers: { default: { name: 'Somnia Shannon Explorer', url: 'https://shannon-explorer.somnia.network/' } },
  testnet: true,
})

// ── Viem clients ────────────────────────────────────────────────────────────
const publicClient = createPublicClient({
  chain: somniaTestnet,
  transport: viemHttp(SOMNIA_RPC),
})

let orchestratorAccount: ReturnType<typeof privateKeyToAccount> | null = null
let orchestratorClient: ReturnType<typeof createWalletClient> | null = null
if (ORCHESTRATOR_KEY && ORCHESTRATOR_KEY !== ZERO_PRIVATE_KEY) {
  orchestratorAccount = privateKeyToAccount(ORCHESTRATOR_KEY)
  orchestratorClient = createWalletClient({
    account: orchestratorAccount,
    chain: somniaTestnet,
    transport: viemHttp(SOMNIA_RPC),
  })
  console.log(`[orchestrator] Wallet: ${orchestratorAccount.address}`)
}

if (!CONTRACT_CONFIGURED) {
  console.warn('[config] GAME_CONTRACT_ADDRESS is missing/invalid. On-chain writes are disabled.')
}

// ── In-memory data store ────────────────────────────────────────────────────
const store = new GameStore()

function tokensMatch(expected: string, presented: string): boolean {
  if (!expected || !presented) {return false}

  const expectedBuffer = Buffer.from(expected, 'utf8')
  const presentedBuffer = Buffer.from(presented, 'utf8')
  if (expectedBuffer.length !== presentedBuffer.length) {
    return false
  }

  return timingSafeEqual(expectedBuffer, presentedBuffer)
}

function isAllowedCorsOrigin(origin: string | undefined): boolean {
  return Boolean(origin && CORS_ORIGINS.includes(origin))
}

function rejectUpgrade(socket: Duplex, statusCode: number, message: string): void {
  if (!socket.writable) {
    socket.destroy()
    return
  }

  socket.write(`HTTP/1.1 ${statusCode} ${message}\r\nConnection: close\r\n\r\n`)
  socket.destroy()
}

// ── Express app ─────────────────────────────────────────────────────────────
const app = express()
app.disable('x-powered-by')
setServerLocals(app, {
  contractAddress: CONTRACT_ADDRESS,
  orchestratorApiToken: ORCHESTRATOR_API_TOKEN,
  orchestratorClient,
  publicClient,
  store,
})
app.use(helmet({
  crossOriginResourcePolicy: false,
}))
app.use(cors({
  origin(origin, callback) {
    if (!origin || isAllowedCorsOrigin(origin)) {
      callback(null, true)
      return
    }
    callback(new Error(`Origin ${origin} not allowed by CORS`))
  },
}))
app.use(rateLimit({
  windowMs: 60_000,
  limit: 180,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
}))
app.use(express.json({ limit: '32kb' }))

// ── Routes ──────────────────────────────────────────────────────────────────
app.use('/api/player', playerRouter)
app.use('/api/queue', queueRouter)
app.use('/api/game', gameRouter)
app.use('/api/leaderboard', leaderboardRouter)
app.use('/api/matchmaking', matchmakingRouter)

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    contractAddress: CONTRACT_CONFIGURED ? CONTRACT_ADDRESS : null,
    orchestrator: orchestratorAccount?.address ?? null,
  })
})

app.post('/api/admin/redeploy', rateLimit({
  windowMs: 60_000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
}), asyncHandler((req, res): undefined => {
  if (!REDEPLOY_PASSWORD) {
    res.status(503).json({ error: 'Redeploy endpoint is not configured.' })
    return
  }

  const body = req.body as { password?: unknown } | undefined
  const passwordFromBody = typeof body?.password === 'string' ? body.password : ''
  const providedPassword = (req.header('x-redeploy-password') ?? passwordFromBody).trim()
  if (!tokensMatch(REDEPLOY_PASSWORD, providedPassword)) {
    res.status(401).json({ error: 'Invalid redeploy password.' })
    return
  }

  try {
    const child = spawn('systemctl', ['start', REDEPLOY_SERVICE], {
      detached: true,
      stdio: 'ignore',
    })
    child.unref()
    res.json({
      ok: true,
      message: 'Redeploy triggered.',
      service: REDEPLOY_SERVICE,
      requestedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[redeploy] Failed to trigger:', error)
    res.status(500).json({
      error: 'Failed to trigger redeploy.',
      message: 'Internal server error.',
    })
  }

  return undefined
}))

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' })
})

app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : String(error)
  if (message.includes('not allowed by CORS')) {
    res.status(403).json({ error: 'Origin not allowed' })
    return
  }

  console.error(`[server] Unhandled error: ${message}`)
  res.status(500).json({ error: 'Internal server error' })
})

// ── HTTP + WebSocket server ─────────────────────────────────────────────────
const server = http.createServer(app)
const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 })

type WsMessageType = 'queue_update' | 'match_assigned' | 'match_updated' | 'orchestrator_status' | 'game_event'

interface WsClient {
  ws: WebSocket
  address: string | null
  isAlive: boolean
}

const wsClients = new Set<WsClient>()

function sendWs(client: WsClient, type: WsMessageType, data: unknown) {
  if (client.ws.readyState !== WebSocket.OPEN) {return}
  client.ws.send(JSON.stringify({ schemaVersion: 1, type, data }))
}

function broadcast(type: WsMessageType, data: unknown) {
  for (const client of wsClients) {
    sendWs(client, type, data)
  }
}

function broadcastQueueUpdate() {
  broadcast('queue_update', store.getQueueState())
}

function broadcastMatchUpdated(matchId: number) {
  const match = store.getMatch(matchId)
  if (!match) {return}
  broadcast('match_updated', match)
}

function broadcastMatchAssignments(matchId: number) {
  const match = store.getMatch(matchId)
  if (!match) {return}

  for (const player of match.players) {
    const payload = {
      address: player,
      matchId: match.matchId,
      redirectPath: `/game?matchId=${match.matchId}`,
      status: match.status,
    }

    for (const client of wsClients) {
      if (client.address === player) {
        sendWs(client, 'match_assigned', payload)
      }
    }
  }
}

function broadcastGameEvent(event: unknown) {
  broadcast('game_event', event)
}

function handleIndexedEvent(event: IndexedEvent) {
  switch (event.type) {
    case 'queue_synced':
    case 'queue_joined':
    case 'queue_left': {
      broadcastQueueUpdate()
      break
    }
    case 'game_started': {
      broadcastQueueUpdate()
      broadcastMatchUpdated(event.gameId)
      broadcastMatchAssignments(event.gameId)
      broadcastGameEvent(event)
      break
    }
    case 'game_ended': {
      broadcastQueueUpdate()
      broadcastMatchUpdated(event.gameId)
      broadcastGameEvent(event)
      break
    }
    case 'reward_claimed':
    case 'session_approved':
    case 'session_revoked': {
      broadcastGameEvent(event)
      break
    }
  }
}

wss.on('connection', (ws, req) => {
  const requestUrl = new URL(req.url || '/ws/queue', `http://${req.headers.host || 'localhost'}`)
  const rawAddress = requestUrl.searchParams.get('address')
  const address = rawAddress && isAddress(rawAddress) ? rawAddress.toLowerCase() : null

  const client: WsClient = { ws, address, isAlive: true }
  wsClients.add(client)

  console.log(`[ws] Client connected (${String(wsClients.size)} total)`)
  sendWs(client, 'queue_update', store.getQueueState())

  if (address) {
    const match = store.getMatchForPlayer(address)
    if (match) {
      sendWs(client, 'match_assigned', {
        address,
        matchId: match.matchId,
        redirectPath: `/game?matchId=${match.matchId}`,
        status: match.status,
      })
    }
  }

  ws.on('pong', () => {
    client.isAlive = true
  })

  ws.on('close', () => {
    wsClients.delete(client)
    console.log(`[ws] Client disconnected (${String(wsClients.size)} total)`)
  })

  ws.on('error', () => {
    wsClients.delete(client)
  })
})

server.on('upgrade', (request, socket, head) => {
  const requestUrl = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`)
  if (requestUrl.pathname !== '/ws/queue') {
    rejectUpgrade(socket, 404, 'Not Found')
    return
  }

  if (!isAllowedCorsOrigin(request.headers.origin)) {
    rejectUpgrade(socket, 403, 'Forbidden')
    return
  }

  if (wsClients.size >= MAX_WS_CLIENTS) {
    rejectUpgrade(socket, 503, 'Server Busy')
    return
  }

  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request)
  })
})

const wsHeartbeat = setInterval(() => {
  for (const client of wsClients) {
    if (client.ws.readyState !== WebSocket.OPEN) {
      wsClients.delete(client)
      continue
    }

    if (!client.isAlive) {
      client.ws.terminate()
      wsClients.delete(client)
      continue
    }

    client.isAlive = false
    client.ws.ping()
  }
}, 30_000)

server.on('close', () => {
  clearInterval(wsHeartbeat)
})

// ── Chain Event Indexer ─────────────────────────────────────────────────────
const indexer = new Indexer(publicClient, CONTRACT_ADDRESS, store, handleIndexedEvent)

// ── Timeout matchmaking orchestrator ───────────────────────────────────────
let forceStartInFlight = false
let forceStartTimer: ReturnType<typeof setInterval> | null = null

function startForceStartLoop() {
  if (forceStartTimer || !orchestratorClient || !orchestratorAccount || !CONTRACT_CONFIGURED) {return}

  const tickForceStart = async (): Promise<void> => {
    if (forceStartInFlight || !orchestratorClient || !orchestratorAccount) {return}
    if (!store.canForceStart()) {return}

    forceStartInFlight = true
    try {
      const txHash = await orchestratorClient.writeContract({
        account: orchestratorAccount,
        chain: somniaTestnet,
        address: CONTRACT_ADDRESS,
        abi: FORCE_START_ABI,
        functionName: 'forceStartGame',
        args: [],
      })

      broadcast('orchestrator_status', {
        status: 'force_start_submitted',
        txHash,
      })

      console.log(`[orchestrator] forceStartGame submitted: ${txHash}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      broadcast('orchestrator_status', {
        status: 'force_start_failed',
        error: message,
      })
      console.error(`[orchestrator] forceStartGame failed: ${message}`)
    } finally {
      forceStartInFlight = false
    }
  }

  forceStartTimer = setInterval(() => {
    void tickForceStart()
  }, 5000)
}

// ── Start server ────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════╗
║   PIXEL ROYALE — Game Orchestrator Server            ║
║                                                      ║
║   HTTP:      http://localhost:${PORT}                  ║
║   WebSocket: ws://localhost:${PORT}/ws/queue            ║
║   Contract:  ${CONTRACT_ADDRESS.slice(0, 20)}...       ║
║   Chain:     Somnia Testnet (50312)                  ║
╚══════════════════════════════════════════════════════╝
  `)

  indexer.start().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[indexer] failed to start: ${message}`)
  })

  startForceStartLoop()
})
