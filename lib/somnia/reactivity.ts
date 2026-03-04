// ── Somnia Reactivity Integration ───────────────────────────────────────────
// Connects to Somnia testnet via WebSocket to subscribe to on-chain game events.
// Uses eth_subscribe for log filtering on the game contract.

import {
  SOMNIA_TESTNET,
  GAME_CONTRACT_ADDRESS,
  EVENT_TOPICS,
  IS_GAME_CONTRACT_CONFIGURED,
} from './config'
import {
  createSupplyDropEvent, createStormChangeEvent, createKillMilestoneEvent,
  createConnectionEvent,
  type SomniaEvent,
} from './events'
import { MAP_WIDTH, MAP_HEIGHT, type Rarity, RARITY_ORDER } from '@/lib/game/constants'

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

    if (!IS_GAME_CONTRACT_CONFIGURED) {
      onEvent(createConnectionEvent(
        'No game contract configured. Set NEXT_PUBLIC_PIXEL_ROYALE_ADDRESS to enable live on-chain events.',
        'chain_error',
      ))
      return
    }

    const wsUrl = SOMNIA_TESTNET.rpcUrls.default.webSocket[0]

    try {
      onEvent(createConnectionEvent('Connecting to Somnia Testnet...'))

      ws = new WebSocket(wsUrl)

      ws.onopen = () => {
        connected = true
        onEvent(createConnectionEvent('Connected to Somnia Testnet (Chain ID: 50312)'))

        // Subscribe to game contract events using eth_subscribe
        // This is the Somnia reactivity pattern - subscribing to log events
        const subscribeMsg = {
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_subscribe',
          params: [
            'logs',
            {
              address: GAME_CONTRACT_ADDRESS,
              topics: [
                [
                  EVENT_TOPICS.SupplyDrop,
                  EVENT_TOPICS.StormPhaseChanged,
                  EVENT_TOPICS.PlayerKillMilestone,
                ],
              ],
            },
          ],
        }

        ws!.send(JSON.stringify(subscribeMsg))
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)

          // Handle subscription confirmation
          if (data.id === 1 && data.result) {
            subscriptionId = data.result
            onEvent(createConnectionEvent(
              `Subscribed to game events (sub: ${subscriptionId?.slice(0, 10)}...)`,
            ))
            return
          }

          // Handle subscription notifications (reactive events)
          if (data.method === 'eth_subscription' && data.params?.result) {
            const log = data.params.result
            handleLog(log, onEvent)
          }
        } catch {
          // Ignore parse errors
        }
      }

      ws.onerror = () => {
        onEvent(createConnectionEvent(
          'WebSocket error - falling back to demo mode', 'chain_error',
        ))
      }

      ws.onclose = () => {
        connected = false
        subscriptionId = null
        ws = null

        // Auto-reconnect after 5 seconds
        if (!reconnectTimer) {
          reconnectTimer = setTimeout(() => {
            reconnectTimer = null
            connect()
          }, 5000)
        }
      }
    } catch {
      onEvent(createConnectionEvent(
        'Failed to connect to Somnia Testnet - using demo mode', 'chain_error',
      ))
    }
  }

  function disconnect() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }

    if (ws) {
      // Unsubscribe
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

// ── Parse on-chain log to game event ────────────────────────────────────────

function handleLog(
  log: { topics: string[]; data: string; transactionHash?: string },
  onEvent: (event: SomniaEvent) => void,
) {
  const topic = log.topics[0]
  const txHash = log.transactionHash

  if (topic === EVENT_TOPICS.SupplyDrop) {
    // Decode supply drop data
    const x = (parseInt(log.data.slice(2, 66), 16) % MAP_WIDTH) || (Math.random() * MAP_WIDTH * 0.6 + MAP_WIDTH * 0.2)
    const y = (parseInt(log.data.slice(66, 130), 16) % MAP_HEIGHT) || (Math.random() * MAP_HEIGHT * 0.6 + MAP_HEIGHT * 0.2)
    const rarityIdx = Math.min(parseInt(log.data.slice(130, 194), 16) || 0, RARITY_ORDER.length - 1)
    const rarity = RARITY_ORDER[rarityIdx]

    onEvent(createSupplyDropEvent(x, y, rarity, 'testnet', txHash))
  } else if (topic === EVENT_TOPICS.StormPhaseChanged) {
    const phase = parseInt(log.data.slice(2, 66), 16) || 0
    const centerX = parseInt(log.data.slice(66, 130), 16) || MAP_WIDTH / 2
    const centerY = parseInt(log.data.slice(130, 194), 16) || MAP_HEIGHT / 2
    const radius = parseInt(log.data.slice(194, 258), 16) || 1000

    onEvent(createStormChangeEvent(phase, centerX, centerY, radius, 'testnet', txHash))
  } else if (topic === EVENT_TOPICS.PlayerKillMilestone) {
    const player = '0x' + (log.topics[1]?.slice(26) || '0'.repeat(40))
    const killCount = parseInt(log.data.slice(2, 66), 16) || 0

    onEvent(createKillMilestoneEvent(
      `${player.slice(0, 6)}...${player.slice(-4)}`,
      killCount,
      'Bonus Loot',
      'testnet',
      txHash,
    ))
  }
}
