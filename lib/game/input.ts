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
  }
}

export function setupInput(canvas: HTMLCanvasElement, state: InputState) {
  const resetInputState = () => {
    state.keys.clear()
    state.mouseDown = false
    state.justPressed.clear()
    state.justClicked = false
    state.scrollDelta = 0
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
  }

  const onMouseDown = (e: MouseEvent) => {
    if (e.button === 0) {
      state.mouseDown = true
      state.justClicked = true
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
) {
  state.mouseWorldX = state.mouseX + cameraX
  state.mouseWorldY = state.mouseY + cameraY
}
