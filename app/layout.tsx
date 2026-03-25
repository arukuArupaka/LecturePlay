import type { Metadata, Viewport } from 'next'
import { M_PLUS_Rounded_1c } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

const mPlusRounded = M_PLUS_Rounded_1c({ 
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-sans"
})

export const metadata: Metadata = {
  title: 'LecturePlay - 講義中ビンゴ',
  description: '講義中にこっそり遊べるマルチプレイヤービンゴゲーム',
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
  themeColor: '#1a1a2e',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ja" className="dark">
      <body className={`${mPlusRounded.variable} font-sans antialiased min-h-screen`}>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
