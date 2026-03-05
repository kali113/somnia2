import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { WebSocketServer, WebSocket } from 'ws'
import http from 'http'
import { createPublicClient, createWalletClient, http as viemHttp, isAddress, type Address } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { playerRouter } from './routes/player.js'
import { queueRouter } from './routes/queue.js'
import { gameRouter } from './routes/game.js'
import { leaderboardRouter } from './routes/leaderboard.js'
import { Indexer } from './indexer.js'
import { GameStore } from './store.js'

// ── Environment ─────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '3001', 10)
const SOMNIA_RPC = process.env.SOMNIA_RPC_URL || 'https://dream-rpc.somnia.network'
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const
const HARDCODED_CONTRACT_ADDRESS = '0x2e30F75873B1A3A07A55179E6e7CBb7Fa8a3B0a7' as const
const rawContractAddress = (process.env.GAME_CONTRACT_ADDRESS || HARDCODED_CONTRACT_ADDRESS).trim()
const CONTRACT_ADDRESS = (isAddress(rawContractAddress) ? rawContractAddress : ZERO_ADDRESS) as Address
const CONTRACT_CONFIGURED = CONTRACT_ADDRESS.toLowerCase() !== ZERO_ADDRESS
const ORCHESTRATOR_KEY = process.env.ORCHESTRATOR_PRIVATE_KEY as `0x${string}` | undefined
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:3000'

// ── Somnia chain definition ─────────────────────────────────────────────────
const somniaTestnet = {
  id: 50312,
  name: 'Somnia Testnet',
  nativeCurrency: { name: 'Somnia Test Token', symbol: 'STT', decimals: 18 },
  rpcUrls: { default: { http: [SOMNIA_RPC] } },
  blockExplorers: { default: { name: 'Somnia Shannon Explorer', url: 'https://shannon-explorer.somnia.network/' } },
  testnet: true,
} as const

// ── Viem clients ────────────────────────────────────────────────────────────
const publicClient = createPublicClient({
  chain: somniaTestnet as any,
  transport: viemHttp(SOMNIA_RPC),
})

let orchestratorClient: ReturnType<typeof createWalletClient> | null = null
if (ORCHESTRATOR_KEY && ORCHESTRATOR_KEY !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
  const account = privateKeyToAccount(ORCHESTRATOR_KEY)
  orchestratorClient = createWalletClient({
    account,
    chain: somniaTestnet as any,
    transport: viemHttp(SOMNIA_RPC),
  })
  console.log(`[orchestrator] Wallet: ${account.address}`)
}

if (!CONTRACT_CONFIGURED) {
  console.warn('[config] GAME_CONTRACT_ADDRESS is missing/invalid. On-chain writes are disabled.')
}

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

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() })
})

// ── HTTP + WebSocket server ─────────────────────────────────────────────────
const server = http.createServer(app)
const wss = new WebSocketServer({ server, path: '/ws/queue' })

// Track connected clients
const wsClients = new Set<WebSocket>()

wss.on('connection', (ws) => {
  wsClients.add(ws)
  console.log(`[ws] Client connected (${wsClients.size} total)`)

  // Send current queue state immediately
  ws.send(JSON.stringify({
    type: 'queue_update',
    data: store.getQueueState(),
  }))

  ws.on('close', () => {
    wsClients.delete(ws)
    console.log(`[ws] Client disconnected (${wsClients.size} total)`)
  })
})

// Broadcast queue updates to all WebSocket clients
function broadcastQueueUpdate() {
  const msg = JSON.stringify({
    type: 'queue_update',
    data: store.getQueueState(),
  })
  for (const ws of wsClients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msg)
    }
  }
}

// Broadcast game events
function broadcastGameEvent(event: any) {
  const msg = JSON.stringify({
    type: 'game_event',
    data: event,
  })
  for (const ws of wsClients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msg)
    }
  }
}

// Make broadcast functions available
;(app as any).broadcastQueueUpdate = broadcastQueueUpdate
;(app as any).broadcastGameEvent = broadcastGameEvent

// ── Chain Event Indexer ─────────────────────────────────────────────────────
const indexer = new Indexer(publicClient as any, CONTRACT_ADDRESS, store, (event: any) => {
  broadcastGameEvent(event)
  broadcastQueueUpdate()
})

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

  // Start indexer
  indexer.start().catch(console.error)
})
