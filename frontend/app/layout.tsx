import './globals.css'
import { Press_Start_2P } from 'next/font/google'

const pressStart2P = Press_Start_2P({
  weight: '400',
  subsets: ['latin'],
})

export const metadata = {
  title: 'Guess The Song',
  description: 'Music guessing game',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pl">
      <body className={`${pressStart2P.className} bg-grid min-h-screen`}>
        {children}
      </body>
    </html>
  )
}