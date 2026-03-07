// ── Audio Manager (Web Audio API) ───────────────────────────────────────────

let audioCtx: AudioContext | null = null
let muted = false

function ensureCtx(): AudioContext | null {
  if (!audioCtx) {
    try {
      audioCtx = new AudioContext()
    } catch {
      return null
    }
  }
  return audioCtx
}

export function setMuted(m: boolean) {
  muted = m
}

export function isMuted(): boolean {
  return muted
}

export async function activateAudio(): Promise<boolean> {
  const ctx = ensureCtx()
  if (!ctx) {return false}

  try {
    if (ctx.state === 'suspended') {
      await ctx.resume()
    }
  } catch {
    return false
  }

  return ctx.state === 'running'
}

function playTone(freq: number, duration: number, type: OscillatorType = 'square', volume = 0.1) {
  if (muted) {return}
  if (!audioCtx || audioCtx.state !== 'running') {return}

  const ctx = audioCtx

  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.type = type
  osc.frequency.setValueAtTime(freq, ctx.currentTime)
  gain.gain.setValueAtTime(volume, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration)
  osc.start(ctx.currentTime)
  osc.stop(ctx.currentTime + duration)
}

export function playShot(weaponId: string) {
  switch (weaponId) {
    case 'ar':
      playTone(180, 0.08, 'sawtooth', 0.08)
      break
    case 'shotgun':
      playTone(100, 0.15, 'sawtooth', 0.12)
      setTimeout(() => { playTone(80, 0.1, 'sawtooth', 0.06); }, 30)
      break
    case 'smg':
      playTone(250, 0.05, 'square', 0.06)
      break
    case 'sniper':
      playTone(120, 0.25, 'sawtooth', 0.1)
      setTimeout(() => { playTone(60, 0.3, 'sine', 0.05); }, 50)
      break
    case 'pickaxe':
      playTone(400, 0.1, 'triangle', 0.08)
      break
  }
}

export function playHit() {
  playTone(600, 0.08, 'square', 0.06)
}

export function playElim() {
  playTone(800, 0.1, 'square', 0.08)
  setTimeout(() => { playTone(1000, 0.1, 'square', 0.08); }, 80)
  setTimeout(() => { playTone(1200, 0.15, 'square', 0.08); }, 160)
}

export function playChestOpen() {
  playTone(523, 0.1, 'sine', 0.08)
  setTimeout(() => { playTone(659, 0.1, 'sine', 0.08); }, 100)
  setTimeout(() => { playTone(784, 0.15, 'sine', 0.08); }, 200)
}

export function playPickup() {
  playTone(440, 0.08, 'sine', 0.06)
  setTimeout(() => { playTone(550, 0.08, 'sine', 0.06); }, 60)
}

export function playBuild() {
  playTone(200, 0.1, 'triangle', 0.05)
  playTone(300, 0.05, 'triangle', 0.03)
}

export function playVictory() {
  const notes = [523, 659, 784, 1047]
  notes.forEach((n, i) => {
    setTimeout(() => { playTone(n, 0.3, 'sine', 0.1); }, i * 200)
  })
}

export function playEliminated() {
  playTone(400, 0.2, 'sawtooth', 0.08)
  setTimeout(() => { playTone(300, 0.2, 'sawtooth', 0.08); }, 150)
  setTimeout(() => { playTone(200, 0.4, 'sawtooth', 0.08); }, 300)
}

export function playSupplyDrop() {
  playTone(800, 0.15, 'sine', 0.06)
  setTimeout(() => { playTone(1000, 0.15, 'sine', 0.06); }, 150)
  setTimeout(() => { playTone(800, 0.2, 'sine', 0.06); }, 300)
}
