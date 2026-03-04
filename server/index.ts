import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { WebSocketServer, WebSocket } from 'ws'
import http from 'http'
import {
  createPublicClient,
  createWalletClient,
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
import { Indexer, type IndexedEvent } from './indexer.js'
import { GameStore } from './store.js'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
const ZERO_PRIVATE_KEY = `0x${'0'.repeat(64)}`
const FORCE_START_ABI = parseAbi(['function forceStartGame()'])

function failConfig(message: string): never {
  throw new Error(`[config] ${message}`)
}

function loadContractAddress(): Address {
  const value = process.env.GAME_CONTRACT_ADDRESS
  if (!value) {
    return failConfig('GAME_CONTRACT_ADDRESS is required')
  }
  if (!isAddress(value)) {
    return failConfig('GAME_CONTRACT_ADDRESS must be a valid 0x address')
  }
  if (value.toLowerCase() === ZERO_ADDRESS) {
    return failConfig('GAME_CONTRACT_ADDRESS cannot be the zero address')
  }
  return value
}

function loadOrchestratorKey(): `0x${string}` {
  const value = process.env.ORCHESTRATOR_PRIVATE_KEY
  if (!value) {
    return failConfig('ORCHESTRATOR_PRIVATE_KEY is required for matchmaking orchestration')
  }
  if (!/^0x[a-fA-F0-9]{64}$/.test(value)) {
    return failConfig('ORCHESTRATOR_PRIVATE_KEY must be a 32-byte hex private key')
  }
  if (value.toLowerCase() === ZERO_PRIVATE_KEY) {
    return failConfig('ORCHESTRATOR_PRIVATE_KEY cannot be all zeros')
  }
  return value as `0x${string}`
}

// ── Environment ─────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '3001', 10)
const SOMNIA_RPC = process.env.SOMNIA_RPC_URL || 'https://dream-rpc.somnia.network'
const CONTRACT_ADDRESS = loadContractAddress()
const ORCHESTRATOR_KEY = loadOrchestratorKey()
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:3000'

// ── Somnia chain definition ─────────────────────────────────────────────────
const somniaTestnet = {
  id: 50312,
  name: 'Somnia Testnet',
  nativeCurrency: { name: 'Somnia Test Token', symbol: 'STT', decimals: 18 },
  rpcUrls: { default: { http: [SOMNIA_RPC] } },
  blockExplorers: { default: { name: 'Somnia Explorer', url: 'https://somnia-testnet.socialscan.io' } },
  testnet: true,
} as const

// ── Viem clients ────────────────────────────────────────────────────────────
const publicClient = createPublicClient({
  chain: somniaTestnet as any,
  transport: viemHttp(SOMNIA_RPC),
})

const account = privateKeyToAccount(ORCHESTRATOR_KEY)
const orchestratorClient = createWalletClient({
  account,
  chain: somniaTestnet as any,
  transport: viemHttp(SOMNIA_RPC),
})

console.log(`[orchestrator] Wallet: ${account.address}`)

// ── In-memory data store ────────────────────────────────────────────────────
const store = new GameStore()

// ── Express app ─────────────────────────────────────────────────────────────
const app = express()
app.use(cors({ origin: CORS_ORIGIN }))
app.use(express.json())

// Attach shared state to request
app.use((req, _res, next) => {
  ;(req as any).store = store
  ;(req as any).publicClient = publicClient
  ;(req as any).orchestratorClient = orchestratorClient
  ;(req as any).contractAddress = CONTRACT_ADDRESS
  next()
})

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
    contractAddress: CONTRACT_ADDRESS,
    orchestrator: account.address,
  })
})

// ── HTTP + WebSocket server ─────────────────────────────────────────────────
const server = http.createServer(app)
const wss = new WebSocketServer({ server, path: '/ws/queue' })

type WsMessageType = 'queue_update' | 'match_assigned' | 'match_updated' | 'orchestrator_status' | 'game_event'

interface WsClient {
  ws: WebSocket
  address: string | null
}

const wsClients = new Set<WsClient>()

function sendWs(client: WsClient, type: WsMessageType, data: unknown) {
  if (client.ws.readyState !== WebSocket.OPEN) return
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
  if (!match) return
  broadcast('match_updated', match)
}

function broadcastMatchAssignments(matchId: number) {
  const match = store.getMatch(matchId)
  if (!match) return

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

  const client: WsClient = { ws, address }
  wsClients.add(client)

  console.log(`[ws] Client connected (${wsClients.size} total)`) 
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

  ws.on('close', () => {
    wsClients.delete(client)
    console.log(`[ws] Client disconnected (${wsClients.size} total)`)
  })
})

// Make broadcast functions available for existing routes
;(app as any).broadcastQueueUpdate = broadcastQueueUpdate
;(app as any).broadcastGameEvent = broadcastGameEvent

// ── Chain Event Indexer ─────────────────────────────────────────────────────
const indexer = new Indexer(publicClient as any, CONTRACT_ADDRESS, store, handleIndexedEvent)

// ── Timeout matchmaking orchestrator ───────────────────────────────────────
let forceStartInFlight = false
let forceStartTimer: ReturnType<typeof setInterval> | null = null

function startForceStartLoop() {
  if (forceStartTimer) return

  forceStartTimer = setInterval(async () => {
    if (forceStartInFlight) return
    if (!store.canForceStart()) return

    forceStartInFlight = true
    try {
      const txHash = await orchestratorClient.writeContract({
        chain: somniaTestnet as any,
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

  indexer.start().catch((error) => {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[indexer] failed to start: ${message}`)
  })

  startForceStartLoop()
})
