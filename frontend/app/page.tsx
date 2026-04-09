'use client'
import { useRouter } from 'next/navigation'

export default function HomePage() {
  const router = useRouter()

  return (
    <main className="bg-grid flex min-h-screen items-center justify-center bg-white p-6">
      <div className="flex flex-col items-center gap-6 overflow-visible">
        <img src="/top-menu.svg" alt="top" className="w-[600px]" />

        <div className="relative flex min-h-[260px] w-[600px] items-center justify-center overflow-visible">
          <img
            src="/left-side.svg"
            alt="left"
            className="absolute left-[-35px] w-[100px]"
          />

          <div className="z-10 flex w-[260px] flex-col gap-4">
            <button
              onClick={() => router.push('/mode')}
              className="pixel-btn border-4 border-black bg-gradient-to-b from-fuchsia-500 to-purple-600 py-3 text-white"
            >
              ▶ START GAME
            </button>

            <button
              onClick={() => router.push('/how-to-play')}
              className="pixel-btn border-4 border-black bg-white py-3 text-black"
            >
              ❓ HOW TO PLAY
            </button>

            <button
              onClick={() => router.push('/settings')}
              className="pixel-btn border-4 border-black bg-gradient-to-b from-fuchsia-500 to-purple-600 py-3 text-white"
            >
              ⚙ SETTINGS
            </button>
          </div>

          <img
            src="/right-side.svg"
            alt="right"
            className="absolute right-[-80px] w-[200px]"
          />
        </div>

        <img src="/bottom.svg" alt="bottom" className="w-[500px]" />
      </div>
    </main>
  )
}