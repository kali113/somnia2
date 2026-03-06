'use client'

import { useEffect } from 'react'

export default function FrameGuard() {
  useEffect(() => {
    if (window.top === window.self) {
      return
    }

    try {
      window.top!.location.href = window.location.href
    } catch {
      window.location.href = window.location.href
    }
  }, [])

  return null
}
