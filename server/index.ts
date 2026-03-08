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
  decodeEventLog,
  defineChain,
  fallback,
  http as viemHttp,
  isAddress,
  parseAbi,
  webSocket,
  type Address,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { SDK as SomniaReactivitySDK, type SubscriptionCallback } from '@somnia-chain/reactivity'
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

function readDeployment(): {
  contract?: { address?: string }
  reactivityHandler?: { address?: string }
  reactiveOrchestrator?: { address?: string }
  reactiveRewards?: { address?: string }
  leaderboard?: { address?: string }
} {
  try {
    const deploymentPath = path.join(projectRoot, 'contracts', 'deployments', 'somnia-shannon-50312.json')
    const raw = readFileSync(deploymentPath, 'utf8')
    return JSON.parse(raw) as {
      contract?: { address?: string }
      reactivityHandler?: { address?: string }
      reactiveOrchestrator?: { address?: string }
      reactiveRewards?: { address?: string }
      leaderboard?: { address?: string }
    }
  } catch {
    return {}
  }
}

// ── Environment ─────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '3001', 10)
const SOMNIA_RPC = process.env.SOMNIA_RPC_URL || 'https://rpc.ankr.com/somnia_testnet'
const SOMNIA_RPC_FALLBACKS: readonly string[] = [
  SOMNIA_RPC,
  'https://50312.rpc.thirdweb.com',
  'https://dream-rpc.somnia.network',
]
const deployment = readDeployment()
const DEPLOYED_CONTRACT_ADDRESS = (deployment.contract?.address || '').trim()
const rawContractAddress = (
  process.env.GAME_CONTRACT_ADDRESS ||
  process.env.NEXT_PUBLIC_PIXEL_ROYALE_ADDRESS ||
  process.env.NEXT_PUBLIC_GAME_CONTRACT_ADDRESS ||
  DEPLOYED_CONTRACT_ADDRESS ||
  ZERO_ADDRESS
).trim()
const CONTRACT_ADDRESS: Address = isAddress(rawContractAddress) ? rawContractAddress : ZERO_ADDRESS
const CONTRACT_CONFIGURED = CONTRACT_ADDRESS.toLowerCase() !== ZERO_ADDRESS
const REACTIVITY_EVENT_SOURCES = [
  CONTRACT_ADDRESS,
  deployment.reactivityHandler?.address,
  deployment.reactiveOrchestrator?.address,
  deployment.reactiveRewards?.address,
  deployment.leaderboard?.address,
].filter((value): value is Address => Boolean(value && isAddress(value) && value.toLowerCase() !== ZERO_ADDRESS))
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
  rpcUrls: { default: { http: [...SOMNIA_RPC_FALLBACKS] } },
  blockExplorers: { default: { name: 'Somnia Shannon Explorer', url: 'https://shannon-explorer.somnia.network/' } },
  testnet: true,
})

// ── Viem clients ────────────────────────────────────────────────────────────
const publicClient = createPublicClient({
  chain: somniaTestnet,
  transport: fallback(
    SOMNIA_RPC_FALLBACKS.map((url) => viemHttp(url)),
    { rank: true },
  ),
})

let orchestratorAccount: ReturnType<typeof privateKeyToAccount> | null = null
let orchestratorClient: ReturnType<typeof createWalletClient> | null = null
if (ORCHESTRATOR_KEY && ORCHESTRATOR_KEY !== ZERO_PRIVATE_KEY) {
  orchestratorAccount = privateKeyToAccount(ORCHESTRATOR_KEY)
  orchestratorClient = createWalletClient({
    account: orchestratorAccount,
    chain: somniaTestnet,
    transport: fallback(
      SOMNIA_RPC_FALLBACKS.map((url) => viemHttp(url)),
      { rank: true },
    ),
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
  if (!origin) {return false}
  if (CORS_ORIGINS.includes(origin)) {return true}
  // Allow Cloudflare Tunnel origins (*.trycloudflare.com)
  try {
    const parsed = new URL(origin)
    if (parsed.hostname.endsWith('.trycloudflare.com')) {return true}
  } catch {
    // ignore
  }
  return false
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
app.set('trust proxy', 1)
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
    case 'player_eliminated': {
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
  if (reactivityCleanup) {
    reactivityCleanup()
  }
})

// ── Chain Event Indexer ─────────────────────────────────────────────────────
const indexer = new Indexer(publicClient, CONTRACT_ADDRESS, store, handleIndexedEvent)

// ── Somnia Reactivity (off-chain push subscription) ─────────────────────────
const SOMNIA_WS_URL = process.env.SOMNIA_WS_URL || 'wss://dream-rpc.somnia.network/ws'

let reactivityCleanup: (() => void) | null = null

async function startReactivitySubscription(): Promise<void> {
  if (!CONTRACT_CONFIGURED) {
    console.log('[reactivity] Contract not configured, skipping off-chain subscription')
    return
  }

  if (!SOMNIA_WS_URL) {
    console.log('[reactivity] No WebSocket URL configured, skipping off-chain subscription')
    return
  }

  console.log(`[reactivity] Connecting via WebSocket: ${SOMNIA_WS_URL}`)

  try {
    // Create a WebSocket-backed public client for the SDK
    const wsPublicClient = createPublicClient({
      chain: somniaTestnet,
      transport: webSocket(SOMNIA_WS_URL),
    })

    const sdk = new SomniaReactivitySDK({
      public: wsPublicClient,
      ...(orchestratorClient ? { wallet: orchestratorClient } : {}),
    })

    // Event topic hashes are computed by the SDK for filtering internally.
    // We keep them available as comments for reference:
    // GameStarted: keccak256(toBytes('GameStarted(uint256,address[],uint256)'))
    // GameEnded: keccak256(toBytes('GameEnded(uint256,address,address[],uint256)'))
    // PlayerJoinedQueue: keccak256(toBytes('PlayerJoinedQueue(address,uint256)'))
    // PlayerLeftQueue: keccak256(toBytes('PlayerLeftQueue(address,uint256)'))
    // RewardClaimed: keccak256(toBytes('RewardClaimed(address,uint256)'))
    // SessionKeyApproved: keccak256(toBytes('SessionKeyApproved(address,address,uint256)'))
    // SessionKeyRevoked: keccak256(toBytes('SessionKeyRevoked(address,address)'))

    const CONTRACT_ABI = parseAbi([
      'event PlayerJoinedQueue(address indexed player, uint256 queueSize)',
      'event PlayerLeftQueue(address indexed player, uint256 queueSize)',
      'event GameStarted(uint256 indexed gameId, address[] players, uint256 prizePool)',
      'event GameEnded(uint256 indexed gameId, address indexed winner, address[] placements, uint256 prizePool)',
      'event RewardClaimed(address indexed player, uint256 amount)',
      'event SessionKeyApproved(address indexed player, address indexed sessionKey, uint256 expiry)',
      'event SessionKeyRevoked(address indexed player, address indexed sessionKey)',
      'event PlayerEliminated(uint256 indexed gameId, address indexed player, address indexed killer, uint256 placement, uint256 timestamp)',
      'event ReactiveForceStartAttempt(address indexed player, uint256 queueSize, bool success, bytes returnData)',
      'event ReactiveRewardClaim(uint256 indexed gameId, address indexed player, uint256 placement, bool success, bytes returnData)',
      'event LeaderboardUpdated(uint256 indexed gameId, address indexed winner, uint256 playerCount, uint256 prizePool)',
    ] as const)

    const result = await sdk.subscribe({
      ethCalls: [],
      eventContractSources: REACTIVITY_EVENT_SOURCES,
      onData: (data: SubscriptionCallback) => {
        try {
          const { topics, data: eventData } = data.result
          if (!topics || topics.length === 0) {
            return
          }

          // Decode using viem
          const decoded = decodeEventLog({
            abi: CONTRACT_ABI,
            topics: topics as [`0x${string}`, ...`0x${string}`[]],
            data: eventData,
          })

          // Update store and trigger WS broadcasts based on event type
          if (decoded.eventName === 'PlayerJoinedQueue') {
            const args = decoded.args as { player: Address; queueSize: bigint }
            store.recordQueueJoin(args.player)
            handleIndexedEvent({
              type: 'queue_joined',
              player: args.player.toLowerCase(),
              queueSize: Number(args.queueSize),
              txHash: null,
            })
          } else if (decoded.eventName === 'PlayerLeftQueue') {
            const args = decoded.args as { player: Address; queueSize: bigint }
            store.recordQueueLeave(args.player)
            handleIndexedEvent({
              type: 'queue_left',
              player: args.player.toLowerCase(),
              queueSize: Number(args.queueSize),
              txHash: null,
            })
          } else if (decoded.eventName === 'GameStarted') {
            const args = decoded.args as { gameId: bigint; players: readonly Address[]; prizePool: bigint }
            const players = [...args.players].map((p) => p.toLowerCase())
            const prizePool = args.prizePool.toString()
            const now = Math.floor(Date.now() / 1000)

            store.recordQueueGameStarted(players)
            store.recordMatchStarted({
              gameId: Number(args.gameId),
              players,
              prizePool,
              startedAt: now,
              txHash: null,
            })
            handleIndexedEvent({
              type: 'game_started',
              gameId: Number(args.gameId),
              players,
              prizePool,
              txHash: null,
            })
          } else if (decoded.eventName === 'GameEnded') {
            const args = decoded.args as { gameId: bigint; winner: Address; placements: readonly Address[]; prizePool: bigint }
            const gameId = Number(args.gameId)
            const winner = args.winner.toLowerCase()
            const placements = [...args.placements].map((p) => p.toLowerCase())
            const prizePool = args.prizePool.toString()
            const now = Math.floor(Date.now() / 1000)

            store.recordMatchEnded({
              gameId,
              winner,
              placements,
              prizePool,
              endedAt: now,
              txHash: null,
            })
            store.recordGame({
              gameId,
              timestamp: now,
              winner,
              placements,
              // TODO: GameEnded event doesn't include kills — kill data comes from the /result endpoint
              kills: placements.map(() => 0),
              prizePool,
              playerCount: placements.length,
            })
            handleIndexedEvent({
              type: 'game_ended',
              gameId,
              winner,
              placements,
              prizePool,
              txHash: null,
            })
          }

          // Broadcast the raw decoded event for all events (for kill feed etc.)
          broadcastGameEvent({
            type: 'reactivity_event',
            eventName: decoded.eventName,
            args: decoded.args,
            topics,
            source: 'somnia_reactivity',
            timestamp: Date.now(),
          })

          console.log(`[reactivity] Event received: ${decoded.eventName}`)
        } catch (_err) {
          // Silently ignore decode errors for unrecognized events
        }
      },
      onError: (error: Error) => {
        console.error(`[reactivity] Subscription error: ${error.message}`)
      },
    })

    if (result instanceof Error) {
      console.warn(`[reactivity] Subscription unavailable: ${result.message}`)
      console.log('[reactivity] Falling back to polling indexer only')
      return
    }

    reactivityCleanup = () => {
      result.unsubscribe().catch(() => {})
    }

    console.log(`[reactivity] Off-chain subscription active (id: ${result.subscriptionId})`)
    console.log(`[reactivity] Watching contracts: ${REACTIVITY_EVENT_SOURCES.join(', ')}`)
    console.log(`[reactivity] WebSocket: ${SOMNIA_WS_URL}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[reactivity] Failed to start: ${message}`)
    console.log('[reactivity] Falling back to polling indexer only')
  }
}

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
  }, 3000)
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

  startReactivitySubscription().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[reactivity] failed to start: ${message}`)
  })
})
