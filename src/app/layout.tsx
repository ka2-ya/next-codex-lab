import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'next-codex-lab',
  description: 'Minimal Next.js todo demo with local RAG helpers',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ja">
      <body className="antialiased">{children}</body>
    </html>
  )
}
