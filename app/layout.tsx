import type { Metadata, Viewport } from 'next'
import { Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import FrameGuard from '@/components/FrameGuard'
import { Providers } from '@/lib/providers'
import './globals.css'

const _geistMono = Geist_Mono({ subsets: ["latin"] });
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://va.vercel-scripts.com",
  "connect-src 'self' https: wss: http://localhost:* ws://localhost:* http://127.0.0.1:* ws://127.0.0.1:*",
  "frame-src 'self' https://*.walletconnect.org https://*.walletconnect.com",
  "worker-src 'self' blob:",
].join('; ')

export const metadata: Metadata = {
  title: 'Pixel Royale - 2D Battle Royale with Somnia Reactivity',
  description: 'A 2D pixel-art battle royale game powered by Somnia blockchain reactivity. Drop in, loot up, build cover, and be the last one standing.',
  generator: 'v0.app',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  themeColor: '#050508',
  userScalable: true,
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <meta httpEquiv="Content-Security-Policy" content={CONTENT_SECURITY_POLICY} />
        <meta httpEquiv="Permissions-Policy" content="camera=(), microphone=(), geolocation=()" />
        <meta name="referrer" content="strict-origin-when-cross-origin" />
      </head>
      <body className="min-h-dvh overflow-x-hidden bg-[#050508] font-mono text-white antialiased">
        <FrameGuard />
        <Providers>
          {children}
        </Providers>
        <Analytics />
      </body>
    </html>
  )
}
