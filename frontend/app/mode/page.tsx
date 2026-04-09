'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'

export default function ModePage() {
  const router = useRouter()

  return (
    <main className="min-h-screen flex flex-col px-4">

      <div className="flex justify-center pt-10">
        <Image
          src="/game_mode.svg"
          alt="Game mode"
          width={420}
          height={110}
          className="w-[220px] sm:w-[280px] md:w-[500px]"
          priority
        />
      </div>

      <div className="flex-1 flex items-center justify-center">
        <div className="flex items-center gap-6 md:gap-10">

          <button
            onClick={() => router.push('/play')}
            className="hover:-translate-y-1 transition"
          >
            <Image
              src="/single.svg"
              alt="Singleplayer"
              width={320}
              height={420}
              className="w-[160px] sm:w-[220px] md:w-[260px]"
            />
          </button>

          <Image
            src="/vs.svg"
            alt="VS"
            width={80}
            height={80}
            className="w-[40px] sm:w-[55px]"
          />

          <button
            onClick={() => router.push('/multiplayer')}
            className="hover:-translate-y-1 transition"
          >
            <Image
              src="/multi.svg"
              alt="Multiplayer"
              width={320}
              height={420}
              className="w-[160px] sm:w-[220px] md:w-[260px]"
            />
          </button>

        </div>
      </div>

      <div className="flex justify-center pb-6">
        <Image
          src="/icons.svg"
          alt="Decorative icons"
          width={200}
          height={60}
          className="w-[120px] sm:w-[150px] md:w-[450px]"
        />
      </div>

    </main>
  )
}