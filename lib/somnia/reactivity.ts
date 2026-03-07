// ── Somnia Reactivity Integration ───────────────────────────────────────────
// Receives game events from the server's Somnia Reactivity subscription
// via the existing WebSocket connection. Falls back to direct eth_subscribe
// if the server connection is unavailable.

import { decodeEventLog } from 'viem'
import {
  SOMNIA_TESTNET,
  GAME_CONTRACT_ADDRESS,
  IS_GAME_CONTRACT_CONFIGURED,
} from './config'
import { pixelRoyaleAbi } from './contract'
import {
  createChestOpenedEvent,
  createConnectionEvent,
  createGameEndedEvent,
  createGameStartedEvent,
  createQueueJoinedEvent,
  createQueueLeftEvent,
  createRewardClaimedEvent,
  createSessionApprovedEvent,
  createSessionRevokedEvent,
  createStormCommittedEvent,
  type SomniaEvent,
} from './events'

export interface ReactivityConnection {
  connect: () => Promise<void>
  disconnect: () => void
  isConnected: () => boolean
}

/**
 * Creates a reactivity connection that listens to the server's WebSocket
 * for game events relayed from Somnia Reactivity SDK.
 *
 * The server handles the actual Somnia Reactivity subscription and pushes
 * decoded events to all connected clients via the `/ws/queue` WebSocket.
 *
 * Falls back to direct `eth_subscribe` if server WebSocket is unavailable.
 */
export function createReactivityConnection(
  onEvent: (event: SomniaEvent) => void,
): ReactivityConnection {
  let ws: WebSocket | null = null
  let connected = false
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let subscriptionId: string | null = null
  let mode: 'server' | 'direct' | null = null

  function getServerWsUrl(): string | null {
    if (typeof window === 'undefined') {
      return null
    }
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.host
    return `${protocol}//${host}/ws/queue`
  }

  function connectToServer(): Promise<void> {
    const serverUrl = getServerWsUrl()
    if (!serverUrl) {
      // SSR or no window — fall back to direct
      return connectDirect()
    }

    return new Promise<void>((resolve) => {
      try {
        onEvent(createConnectionEvent('Connecting to game server...'))
        const serverWs = new WebSocket(serverUrl)
        let resolved = false

        const timeout = setTimeout(() => {
          if (!resolved) {
            resolved = true
            serverWs.close()
            console.warn('[reactivity] Server WS timeout, falling back to direct')
            void connectDirect().then(resolve)
          }
        }, 5000)

        serverWs.onopen = () => {
          if (resolved) {
            return
          }
          resolved = true
          clearTimeout(timeout)
          ws = serverWs
          connected = true
          mode = 'server'
          onEvent(createConnectionEvent(
            'Connected to Somnia Reactivity via game server (Chain ID: 50312)',
          ))
          resolve()
        }

        serverWs.onmessage = (event) => {
          try {
            if (typeof event.data !== 'string') {
              return
            }
            const msg = JSON.parse(event.data) as {
              type?: string
              data?: unknown
            }

            if (msg.type === 'game_event' && msg.data) {
              handleServerEvent(msg.data, onEvent)
            }
          } catch {
            // Ignore parse errors
          }
        }

        serverWs.onerror = () => {
          if (!resolved) {
            resolved = true
            clearTimeout(timeout)
            console.warn('[reactivity] Server WS error, falling back to direct')
            void connectDirect().then(resolve)
          }
        }

        serverWs.onclose = () => {
          if (mode === 'server') {
            connected = false
            ws = null
            mode = null
            scheduleReconnect()
          }
        }
      } catch {
        void connectDirect().then(resolve)
      }
    })
  }

  function connectDirect(): Promise<void> {
    if (connected || (ws && mode === 'direct')) {
      return Promise.resolve()
    }

    if (!IS_GAME_CONTRACT_CONFIGURED) {
      onEvent(createConnectionEvent('Missing contract address configuration', 'chain_error'))
      return Promise.resolve()
    }

    const wsUrl = SOMNIA_TESTNET.rpcUrls.default.webSocket[0]

    try {
      onEvent(createConnectionEvent('Connecting directly to Somnia Testnet...'))

      ws = new WebSocket(wsUrl)
      mode = 'direct'

      ws.onopen = () => {
        connected = true
        onEvent(createConnectionEvent('Connected to Somnia Testnet (Chain ID: 50312)'))

        ws?.send(JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_subscribe',
          params: ['logs', { address: GAME_CONTRACT_ADDRESS }],
        }))
      }

      ws.onmessage = (event) => {
        try {
          if (typeof event.data !== 'string') {
            return
          }
          const data = JSON.parse(event.data) as unknown

          if (isSubscriptionAck(data)) {
            subscriptionId = data.result
            onEvent(createConnectionEvent(
              `Subscribed to contract events (${subscriptionId?.slice(0, 10)}...)`,
            ))
            return
          }

          if (isSubscriptionEvent(data)) {
            handleLog(data.params.result, onEvent)
          }
        } catch {
          // Ignore parse errors
        }
      }

      ws.onerror = () => {
        onEvent(createConnectionEvent(
          'WebSocket error while listening to chain events',
          'chain_error',
        ))
      }

      ws.onclose = () => {
        connected = false
        subscriptionId = null
        ws = null
        mode = null
        scheduleReconnect()
      }
    } catch {
      onEvent(createConnectionEvent('Failed to connect to Somnia Testnet', 'chain_error'))
    }

    return Promise.resolve()
  }

  function scheduleReconnect() {
    if (!reconnectTimer) {
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null
        void connect()
      }, 5000)
    }
  }

  function connect(): Promise<void> {
    if (connected || ws) {
      return Promise.resolve()
    }
    // Try server relay first, fall back to direct
    return connectToServer()
  }

  function disconnect() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }

    if (ws) {
      if (mode === 'direct' && subscriptionId) {
        ws.send(JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'eth_unsubscribe',
          params: [subscriptionId],
        }))
      }
      ws.close()
      ws = null
    }

    connected = false
    subscriptionId = null
    mode = null
  }

  return {
    connect,
    disconnect,
    isConnected: () => connected,
  }
}

// ── Handle events from server relay ─────────────────────────────────────────

function handleServerEvent(
  data: unknown,
  onEvent: (event: SomniaEvent) => void,
) {
  if (typeof data !== 'object' || data === null) {
    return
  }

  const event = data as Record<string, unknown>

  // Handle pre-decoded reactivity events from server
  if (event.source === 'somnia_reactivity' && event.eventName) {
    handleDecodedEvent(
      event.eventName as string,
      event.args as Record<string, unknown>,
      undefined,
      onEvent,
    )
    return
  }

  // Handle IndexedEvent format from server (queue_synced, game_started, etc.)
  if (event.type && typeof event.type === 'string') {
    handleIndexedEvent(event, onEvent)
  }
}

function handleIndexedEvent(
  event: Record<string, unknown>,
  onEvent: (event: SomniaEvent) => void,
) {
  const txHash = typeof event.txHash === 'string' ? event.txHash : undefined

  switch (event.type) {
    case 'game_started':
      onEvent(createGameStartedEvent(
        event.gameId as number,
        (event.players as string[]).map((p) => p.toLowerCase()),
        event.prizePool as string,
        txHash,
      ))
      break
    case 'game_ended':
      onEvent(createGameEndedEvent(
        event.gameId as number,
        (event.winner as string).toLowerCase(),
        (event.placements as string[]).map((p) => p.toLowerCase()),
        event.prizePool as string,
        txHash,
      ))
      break
    case 'reward_claimed':
      onEvent(createRewardClaimedEvent(
        (event.player as string).toLowerCase(),
        event.amount as string,
        txHash,
      ))
      break
    case 'session_approved':
      onEvent(createSessionApprovedEvent(
        (event.player as string).toLowerCase(),
        (event.sessionKey as string).toLowerCase(),
        event.expiry as number,
        txHash,
      ))
      break
    case 'session_revoked':
      onEvent(createSessionRevokedEvent(
        (event.player as string).toLowerCase(),
        (event.sessionKey as string).toLowerCase(),
        txHash,
      ))
      break
  }
}

function handleDecodedEvent(
  eventName: string,
  args: Record<string, unknown>,
  txHash: string | undefined,
  onEvent: (event: SomniaEvent) => void,
) {
  switch (eventName) {
    case 'PlayerJoinedQueue':
      onEvent(createQueueJoinedEvent(
        (args.player as string).toLowerCase(),
        Number(args.queueSize),
        txHash,
      ))
      break
    case 'PlayerLeftQueue':
      onEvent(createQueueLeftEvent(
        (args.player as string).toLowerCase(),
        Number(args.queueSize),
        txHash,
      ))
      break
    case 'GameStarted':
      onEvent(createGameStartedEvent(
        Number(args.gameId),
        (args.players as string[]).map((p) => p.toLowerCase()),
        String(args.prizePool),
        txHash,
      ))
      break
    case 'GameEnded':
      onEvent(createGameEndedEvent(
        Number(args.gameId),
        (args.winner as string).toLowerCase(),
        (args.placements as string[]).map((p) => p.toLowerCase()),
        String(args.prizePool),
        txHash,
      ))
      break
    case 'RewardClaimed':
      onEvent(createRewardClaimedEvent(
        (args.player as string).toLowerCase(),
        String(args.amount),
        txHash,
      ))
      break
    case 'SessionKeyApproved':
      onEvent(createSessionApprovedEvent(
        (args.player as string).toLowerCase(),
        (args.sessionKey as string).toLowerCase(),
        Number(args.expiry),
        txHash,
      ))
      break
    case 'SessionKeyRevoked':
      onEvent(createSessionRevokedEvent(
        (args.player as string).toLowerCase(),
        (args.sessionKey as string).toLowerCase(),
        txHash,
      ))
      break
  }
}

// ── Parse on-chain log to app event (direct mode fallback) ──────────────────

function handleLog(
  log: {
    topics: [] | [`0x${string}`, ...`0x${string}`[]]
    data: `0x${string}`
    transactionHash?: string
  },
  onEvent: (event: SomniaEvent) => void,
) {
  try {
    const parsed = decodeEventLog({
      abi: pixelRoyaleAbi,
      data: log.data,
      topics: log.topics,
      strict: false,
    }) as unknown as DecodedSomniaEvent

    const txHash = log.transactionHash

    if (parsed.eventName === 'PlayerJoinedQueue') {
      onEvent(createQueueJoinedEvent(
        parsed.args.player.toLowerCase(),
        Number(parsed.args.queueSize),
        txHash,
      ))
      return
    }

    if (parsed.eventName === 'PlayerLeftQueue') {
      onEvent(createQueueLeftEvent(
        parsed.args.player.toLowerCase(),
        Number(parsed.args.queueSize),
        txHash,
      ))
      return
    }

    if (parsed.eventName === 'GameStarted') {
      onEvent(createGameStartedEvent(
        Number(parsed.args.gameId),
        parsed.args.players.map((player: string) => player.toLowerCase()),
        parsed.args.prizePool.toString(),
        txHash,
      ))
      return
    }

    if (parsed.eventName === 'GameEnded') {
      onEvent(createGameEndedEvent(
        Number(parsed.args.gameId),
        parsed.args.winner.toLowerCase(),
        parsed.args.placements.map((player: string) => player.toLowerCase()),
        parsed.args.prizePool.toString(),
        txHash,
      ))
      return
    }

    if (parsed.eventName === 'StormCircleCommitted') {
      onEvent(createStormCommittedEvent({
        gameId: Number(parsed.args.gameId),
        phase: Number(parsed.args.phase),
        currentCenterX: Number(parsed.args.currentCenterX),
        currentCenterY: Number(parsed.args.currentCenterY),
        currentRadius: Number(parsed.args.currentRadius),
        targetCenterX: Number(parsed.args.targetCenterX),
        targetCenterY: Number(parsed.args.targetCenterY),
        targetRadius: Number(parsed.args.targetRadius),
        entropyHash: parsed.args.entropyHash,
        timestamp: Number(parsed.args.timestamp),
      }, txHash))
      return
    }

    if (parsed.eventName === 'RewardClaimed') {
      onEvent(createRewardClaimedEvent(
        parsed.args.player.toLowerCase(),
        parsed.args.amount.toString(),
        txHash,
      ))
      return
    }

    if (parsed.eventName === 'SessionKeyApproved') {
      onEvent(createSessionApprovedEvent(
        parsed.args.player.toLowerCase(),
        parsed.args.sessionKey.toLowerCase(),
        Number(parsed.args.expiry),
        txHash,
      ))
      return
    }

    if (parsed.eventName === 'SessionKeyRevoked') {
      onEvent(createSessionRevokedEvent(
        parsed.args.player.toLowerCase(),
        parsed.args.sessionKey.toLowerCase(),
        txHash,
      ))
      return
    }

    if (parsed.eventName === 'ContainerOpened') {
      const containerTypeCode = Number(parsed.args.containerType)
      const containerType = containerTypeCode === 1
        ? 'rare_chest'
        : containerTypeCode === 2
          ? 'ammo_box'
          : 'chest'

      const weaponCode = Number(parsed.args.weaponCode ?? 0)
      const weaponId = weaponCode === 1
        ? 'ar'
        : weaponCode === 2
          ? 'shotgun'
          : weaponCode === 3
            ? 'smg'
            : weaponCode === 4
              ? 'sniper'
              : null

      const consumableCode = Number(parsed.args.consumableCode ?? 0)
      const consumableId = consumableCode === 1
        ? 'bandage'
        : consumableCode === 2
          ? 'mini_shield'
          : consumableCode === 3
            ? 'shield_potion'
            : consumableCode === 4
              ? 'medkit'
              : null

      onEvent(createChestOpenedEvent(
        Number(parsed.args.gameId),
        parsed.args.player.toLowerCase(),
        containerType,
        weaponId,
        consumableId,
        Number(parsed.args.ammoAmount ?? 0),
        txHash,
      ))
    }
  } catch {
    // Ignore non-decoding logs
  }
}

type DecodedSomniaEvent =
  | { eventName: 'PlayerJoinedQueue'; args: { player: string; queueSize: bigint } }
  | { eventName: 'PlayerLeftQueue'; args: { player: string; queueSize: bigint } }
  | { eventName: 'GameStarted'; args: { gameId: bigint; players: string[]; prizePool: bigint } }
  | { eventName: 'GameEnded'; args: { gameId: bigint; winner: string; placements: string[]; prizePool: bigint } }
  | {
      eventName: 'StormCircleCommitted'
      args: {
        gameId: bigint
        phase: bigint
        currentCenterX: bigint
        currentCenterY: bigint
        currentRadius: bigint
        targetCenterX: bigint
        targetCenterY: bigint
        targetRadius: bigint
        entropyHash: string
        timestamp: bigint
      }
    }
  | { eventName: 'RewardClaimed'; args: { player: string; amount: bigint } }
  | { eventName: 'SessionKeyApproved'; args: { player: string; sessionKey: string; expiry: bigint } }
  | { eventName: 'SessionKeyRevoked'; args: { player: string; sessionKey: string } }
  | {
      eventName: 'ContainerOpened'
      args: {
        gameId: bigint
        player: string
        containerType: bigint
        weaponCode?: bigint
        consumableCode?: bigint
        ammoAmount?: bigint
      }
    }

type SubscriptionResponse =
  | {
      id: 1
      result: string
    }
  | {
      method: 'eth_subscription'
      params: {
        result: {
          topics: [] | [`0x${string}`, ...`0x${string}`[]]
          data: `0x${string}`
          transactionHash?: string
        }
      }
    }

function isSubscriptionAck(value: unknown): value is Extract<SubscriptionResponse, { id: 1 }> {
  return typeof value === 'object'
    && value !== null
    && 'id' in value
    && value.id === 1
    && 'result' in value
    && typeof value.result === 'string'
}

function isSubscriptionEvent(value: unknown): value is Extract<SubscriptionResponse, { method: 'eth_subscription' }> {
  if (
    typeof value !== 'object'
    || value === null
    || !('method' in value)
    || value.method !== 'eth_subscription'
    || !('params' in value)
    || typeof value.params !== 'object'
    || value.params === null
    || !('result' in value.params)
    || typeof value.params.result !== 'object'
    || value.params.result === null
  ) {
    return false
  }

  const result = value.params.result as { data?: unknown; topics?: unknown; transactionHash?: unknown }
  const hasValidTopics = Array.isArray(result.topics) && result.topics.every((topic) => typeof topic === 'string')
  return hasValidTopics
    && typeof result.data === 'string'
    && (typeof result.transactionHash === 'string' || typeof result.transactionHash === 'undefined')
}
