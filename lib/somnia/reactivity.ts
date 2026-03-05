// ── Somnia Reactivity Integration ───────────────────────────────────────────
// Connects to Somnia testnet via WebSocket to subscribe to on-chain game events.

import { decodeEventLog } from 'viem'
import { SOMNIA_TESTNET, GAME_CONTRACT_ADDRESS } from './config'
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
  type SomniaEvent,
} from './events'

export interface ReactivityConnection {
  connect: () => Promise<void>
  disconnect: () => void
  isConnected: () => boolean
}

export function createReactivityConnection(
  onEvent: (event: SomniaEvent) => void,
): ReactivityConnection {
  let ws: WebSocket | null = null
  let connected = false
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let subscriptionId: string | null = null

  async function connect() {
    if (connected || ws) return

    if (!GAME_CONTRACT_ADDRESS) {
      onEvent(createConnectionEvent('Missing contract address configuration', 'chain_error'))
      return
    }

    const wsUrl = SOMNIA_TESTNET.rpcUrls.default.webSocket[0]

    try {
      onEvent(createConnectionEvent('Connecting to Somnia Testnet...'))

      ws = new WebSocket(wsUrl)

      ws.onopen = () => {
        connected = true
        onEvent(createConnectionEvent('Connected to Somnia Testnet (Chain ID: 50312)'))

        const subscribeMsg = {
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_subscribe',
          params: [
            'logs',
            {
              address: GAME_CONTRACT_ADDRESS,
            },
          ],
        }

        ws?.send(JSON.stringify(subscribeMsg))
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)

          if (data.id === 1 && data.result) {
            subscriptionId = data.result
            onEvent(createConnectionEvent(
              `Subscribed to contract events (${subscriptionId?.slice(0, 10)}...)`,
            ))
            return
          }

          if (data.method === 'eth_subscription' && data.params?.result) {
            const log = data.params.result
            handleLog(log, onEvent)
          }
        } catch {
          // Ignore parse errors
        }
      }

      ws.onerror = () => {
        onEvent(createConnectionEvent('WebSocket error while listening to chain events', 'chain_error'))
      }

      ws.onclose = () => {
        connected = false
        subscriptionId = null
        ws = null

        if (!reconnectTimer) {
          reconnectTimer = setTimeout(() => {
            reconnectTimer = null
            connect()
          }, 5000)
        }
      }
    } catch {
      onEvent(createConnectionEvent('Failed to connect to Somnia Testnet', 'chain_error'))
    }
  }

  function disconnect() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }

    if (ws) {
      if (subscriptionId) {
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
  }

  return {
    connect,
    disconnect,
    isConnected: () => connected,
  }
}

// ── Parse on-chain log to app event ─────────────────────────────────────────

function handleLog(
  log: { topics: string[]; data: string; transactionHash?: string },
  onEvent: (event: SomniaEvent) => void,
) {
  try {
    const parsed = decodeEventLog({
      abi: pixelRoyaleAbi,
      data: log.data as `0x${string}`,
      topics: log.topics as `0x${string}`[],
      strict: false,
    })

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
