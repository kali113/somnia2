import { MAP_WIDTH, MAP_HEIGHT, type Rarity } from '@/lib/game/constants'
import {
  createSupplyDropEvent,
  createKillMilestoneEvent,
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

  function scheduleSupplyDrop() {
    if (!running) return

    const delay = 25000 + Math.random() * 35000
    const timer = setTimeout(() => {
      if (!running) return

      const x = 300 + Math.random() * (MAP_WIDTH - 600)
      const y = 300 + Math.random() * (MAP_HEIGHT - 600)

      const r = Math.random()
      const rarity: Rarity = r < 0.1 ? 'legendary' : r < 0.35 ? 'epic' : r < 0.65 ? 'rare' : 'uncommon'

      onEvent(createSupplyDropEvent(x, y, rarity, 'demo'))
      scheduleSupplyDrop()
    }, delay)

    timers.push(timer)
  }

  function scheduleKillMilestones() {
    if (!running) return

    const botNames = ['ShadowSniper', 'PixelProwler', 'NeonNinja', 'BlazeMaster', 'CyberSamurai']
    const rewards = ['Bonus Shield', 'Legendary Loot', 'Storm Shield', 'Double XP']
    let milestoneCount = 0

    const interval = setInterval(() => {
      if (!running) {
        clearInterval(interval)
        return
      }

      if (Math.random() < 0.15) {
        milestoneCount += 1
        const name = botNames[Math.floor(Math.random() * botNames.length)]
        const kills = 3 + milestoneCount * 2
        const reward = rewards[Math.floor(Math.random() * rewards.length)]

        onEvent(createKillMilestoneEvent(name, kills, reward, 'demo'))
      }
    }, 20000)

    timers.push(interval as unknown as ReturnType<typeof setTimeout>)
  }

  return {
    start() {
      if (running) return
      running = true

      const initialTimer = setTimeout(() => {
        if (!running) return

        const x = MAP_WIDTH / 2 + (Math.random() - 0.5) * 800
        const y = MAP_HEIGHT / 2 + (Math.random() - 0.5) * 800
        onEvent(createSupplyDropEvent(x, y, 'rare', 'demo'))
        scheduleSupplyDrop()
      }, 15000)

      timers.push(initialTimer)
      scheduleKillMilestones()
    },

    stop() {
      running = false

      for (const timer of timers) {
        clearTimeout(timer)
        clearInterval(timer as unknown as ReturnType<typeof setInterval>)
      }

      timers = []
    },

    isRunning() {
      return running
    },
  }
}
