import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Pixel Royale - Battle Royale',
  description: 'Drop in and fight! 2D pixel-art battle royale with Somnia blockchain reactivity.',
}

export default function GameLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="h-[100dvh] w-full overflow-hidden select-none">
      {children}
    </div>
  )
}
