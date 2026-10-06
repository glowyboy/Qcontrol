import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Q-Control Mobile',
  description: 'Espace sécurisé de contrôle mobile pour les agents Q-Control.',
  generator: 'Q-Control',
  icons: {
    icon: '/q-controle-logo.jpg',
    apple: '/q-controle-logo.jpg',
  },
  manifest: '/manifest.json',
}

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#062c4d',
  userScalable: false,
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="fr" className="bg-[#edf2f3]"><body className="antialiased">{children}{process.env.NODE_ENV === 'production' && <Analytics />}</body></html>
}
