'use client'

import { useEffect } from 'react'

export default function FrameGuard() {
  useEffect(() => {
    const parentWindow = window.top
    if (!parentWindow || parentWindow === window.self) {
      return
    }

    try {
      parentWindow.location.href = window.location.href
    } catch {
      window.location.href = window.location.href
    }
  }, [])

  return null
}
