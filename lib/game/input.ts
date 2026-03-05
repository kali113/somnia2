// ── Input Manager ───────────────────────────────────────────────────────────

export interface InputState {
  keys: Set<string>
  mouseX: number
  mouseY: number
  mouseDown: boolean
  mouseWorldX: number
  mouseWorldY: number
  justPressed: Set<string>
  justClicked: boolean
  scrollDelta: number
  moveX: number
  moveY: number
  aimX: number
  aimY: number
  virtualAimActive: boolean
}

export function createInputState(): InputState {
  return {
    keys: new Set(),
    mouseX: 0,
    mouseY: 0,
    mouseDown: false,
    mouseWorldX: 0,
    mouseWorldY: 0,
    justPressed: new Set(),
    justClicked: false,
    scrollDelta: 0,
    moveX: 0,
    moveY: 0,
    aimX: 1,
    aimY: 0,
    virtualAimActive: false,
  }
}

export function setupInput(canvas: HTMLCanvasElement, state: InputState) {
  const resetInputState = () => {
    state.keys.clear()
    state.mouseDown = false
    state.justPressed.clear()
    state.justClicked = false
    state.scrollDelta = 0
    state.moveX = 0
    state.moveY = 0
    state.virtualAimActive = false
  }

  const onKeyDown = (e: KeyboardEvent) => {
    const key = e.key.toLowerCase()
    if (!state.keys.has(key)) {
      state.justPressed.add(key)
    }
    state.keys.add(key)
    // Prevent default for game keys
    if (['w', 'a', 's', 'd', 'e', 'q', 'r', 'f', 'b', 'g', 'z', 'x', 'c', 'tab', ' '].includes(key)) {
      e.preventDefault()
    }
  }

  const onKeyUp = (e: KeyboardEvent) => {
    state.keys.delete(e.key.toLowerCase())
  }

  const onMouseMove = (e: MouseEvent) => {
    const rect = canvas.getBoundingClientRect()
    state.mouseX = e.clientX - rect.left
    state.mouseY = e.clientY - rect.top
    state.virtualAimActive = false
  }

  const onMouseDown = (e: MouseEvent) => {
    if (e.button === 0) {
      state.mouseDown = true
      state.justClicked = true
      state.virtualAimActive = false
    }
  }

  const onMouseUp = (e: MouseEvent) => {
    if (e.button === 0 || e.button === undefined) {
      state.mouseDown = false
    }
  }

  const onWheel = (e: WheelEvent) => {
    e.preventDefault()
    state.scrollDelta += Math.sign(e.deltaY)
  }

  const onContextMenu = (e: Event) => e.preventDefault()
  const onBlur = () => resetInputState()

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('mouseup', onMouseUp)
  window.addEventListener('blur', onBlur)
  canvas.addEventListener('mousemove', onMouseMove)
  canvas.addEventListener('mousedown', onMouseDown)
  canvas.addEventListener('wheel', onWheel, { passive: false })
  canvas.addEventListener('contextmenu', onContextMenu)

  return () => {
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
    window.removeEventListener('mouseup', onMouseUp)
    window.removeEventListener('blur', onBlur)
    canvas.removeEventListener('mousemove', onMouseMove)
    canvas.removeEventListener('mousedown', onMouseDown)
    canvas.removeEventListener('wheel', onWheel)
    canvas.removeEventListener('contextmenu', onContextMenu)
  }
}

export function clearFrameInput(state: InputState) {
  state.justPressed.clear()
  state.justClicked = false
  state.scrollDelta = 0
}

export function updateMouseWorld(
  state: InputState,
  cameraX: number,
  cameraY: number,
  playerX?: number,
  playerY?: number,
) {
  if (
    state.virtualAimActive
    && typeof playerX === 'number'
    && typeof playerY === 'number'
  ) {
    const magnitude = Math.hypot(state.aimX, state.aimY) || 1
    const normalX = state.aimX / magnitude
    const normalY = state.aimY / magnitude
    const aimDistance = 180

    state.mouseWorldX = playerX + normalX * aimDistance
    state.mouseWorldY = playerY + normalY * aimDistance
    state.mouseX = state.mouseWorldX - cameraX
    state.mouseY = state.mouseWorldY - cameraY
    return
  }

  state.mouseWorldX = state.mouseX + cameraX
  state.mouseWorldY = state.mouseY + cameraY
}

function normalizeKey(key: string): string {
  return key.toLowerCase()
}

function clampAxis(x: number, y: number): { x: number; y: number } {
  const length = Math.hypot(x, y)
  if (length <= 1 || length === 0) return { x, y }
  return { x: x / length, y: y / length }
}

export function setVirtualMove(state: InputState, x: number, y: number) {
  const next = clampAxis(x, y)
  state.moveX = next.x
  state.moveY = next.y
}

export function resetVirtualMove(state: InputState) {
  state.moveX = 0
  state.moveY = 0
}

export function setVirtualAim(state: InputState, x: number, y: number, firing = true) {
  const next = clampAxis(x, y)
  state.aimX = next.x
  state.aimY = next.y
  state.virtualAimActive = true
  state.mouseDown = firing
}

export function clearVirtualAim(state: InputState) {
  state.virtualAimActive = false
  state.mouseDown = false
}

export function tapVirtualKey(state: InputState, key: string) {
  state.justPressed.add(normalizeKey(key))
}

export function setVirtualKeyHeld(state: InputState, key: string, held: boolean) {
  const normalized = normalizeKey(key)
  if (held) {
    if (!state.keys.has(normalized)) {
      state.justPressed.add(normalized)
    }
    state.keys.add(normalized)
    return
  }
  state.keys.delete(normalized)
}

export function addVirtualScroll(state: InputState, delta: number) {
  if (delta === 0) return
  state.scrollDelta += Math.sign(delta)
}

export function tapVirtualClick(state: InputState) {
  state.justClicked = true
}
