// ── Demo Mode: Simulated Somnia Reactive Events ────────────────────────────
// When no wallet is connected, this simulates on-chain reactive events
// to demonstrate how Somnia reactivity would work in production.

import { MAP_WIDTH, MAP_HEIGHT, RARITY_ORDER, type Rarity } from '@/lib/game/constants'
import {
  createSupplyDropEvent, createStormChangeEvent, createKillMilestoneEvent,
  type SomniaEvent,
} from './events'

export interface DemoEventEmitter {
  start: () => void
  stop: () => void
  isRunning: () => boolean
}

export function createDemoEventEmitter(
  onEvent: (event: SomniaEvent) => void,
): DemoEventEmitter {
  let timers: ReturnType<typeof setTimeout>[] = []
  let running = false
  let supplyInterval: ReturnType<typeof setInterval> | null = null

  function scheduleSupplyDrop() {
    if (!running) return
    const delay = 25000 + Math.random() * 35000 // 25-60 seconds

    const timer = setTimeout(() => {
      if (!running) return

      // Random position within the playable map area
      const x = 300 + Math.random() * (MAP_WIDTH - 600)
      const y = 300 + Math.random() * (MAP_HEIGHT - 600)

      // Higher rarity drops are rarer
      const r = Math.random()
      const rarity: Rarity = r < 0.1 ? 'legendary' : r < 0.35 ? 'epic' : r < 0.65 ? 'rare' : 'uncommon'

      const event = createSupplyDropEvent(x, y, rarity, 'demo')
      onEvent(event)

      // Schedule next
      scheduleSupplyDrop()
    }, delay)

    timers.push(timer)
  }

  function scheduleKillMilestones() {
    if (!running) return
    const botNames = ['ShadowSniper', 'PixelProwler', 'NeonNinja', 'BlazeMaster', 'CyberSamurai']
    let milestoneCount = 0

    const checkInterval = setInterval(() => {
      if (!running) {
        clearInterval(checkInterval)
        return
      }

      // Randomly trigger milestone events
      if (Math.random() < 0.15) { // 15% chance per check
        milestoneCount++
        const name = botNames[Math.floor(Math.random() * botNames.length)]
        const kills = 3 + milestoneCount * 2
        const rewards = ['Bonus Shield', 'Legendary Loot', 'Storm Shield', 'Double XP']
        const reward = rewards[Math.floor(Math.random() * rewards.length)]

        const event = createKillMilestoneEvent(name, kills, reward, 'demo')
        onEvent(event)
      }
    }, 20000) // Check every 20 seconds

    timers.push(checkInterval as unknown as ReturnType<typeof setTimeout>)
  }

  return {
    start() {
      if (running) return
      running = true

      // Initial supply drop after 15 seconds
      const initialTimer = setTimeout(() => {
        if (!running) return
        const x = MAP_WIDTH / 2 + (Math.random() - 0.5) * 800
        const y = MAP_HEIGHT / 2 + (Math.random() - 0.5) * 800
        const event = createSupplyDropEvent(x, y, 'rare', 'demo')
        onEvent(event)
        scheduleSupplyDrop()
      }, 15000)

      timers.push(initialTimer)
      scheduleKillMilestones()
    },

    stop() {
      running = false
      for (const t of timers) {
        clearTimeout(t)
        clearInterval(t as unknown as ReturnType<typeof setInterval>)
      }
      timers = []
      if (supplyInterval) {
        clearInterval(supplyInterval)
        supplyInterval = null
      }
    },

    isRunning() {
      return running
    },
  }
}
