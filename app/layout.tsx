import './globals.css'
import { Press_Start_2P, Geist } from 'next/font/google'
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

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
    <html lang="pl" className={cn("font-sans", geist.variable)}>
      <body className={`${pressStart2P.className} bg-grid min-h-screen`}>
        {children}
      </body>
    </html>
  )
}