import Image from "next/image";
import { ThemeToggle } from "./theme-toggle";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col bg-background text-foreground overflow-hidden">
      <div className="flex-1 flex items-center justify-center px-6 py-6">
        <div
          className="
            relative
            w-full max-w-[1200px]
            h-[650px]
            rounded-[28px]
            bg-[oklch(0.9821_0_0)] text-black
            dark:bg-[oklch(0.2178_0_0)] dark:text-white
            overflow-visible
          "
        >
          {/* 🌙 toggle */}
          <div className="absolute top-4 left-4 z-10 bg-black/30 backdrop-blur-md rounded-full p-2">
            <ThemeToggle />
          </div>

          {/* 🔽 content */}
          <div className="h-full flex flex-col items-center justify-center text-center px-10">
            
            <h1 className="text-6xl font-bold tracking-wide leading-none">
              MUZZLY
            </h1>

            <p className="mt-4 text-sm opacity-50">
              Guess songs with your friends!
            </p>

            <p className="mt-6 text-xl font-medium">
              Choose your game mode
            </p>

            {/* 🔳 cards */}
            <div className="mt-8 flex gap-6">
              
              <ModeCard
                icon="/singleplayer.svg"
                title="Singleplayer"
                description="Play alone and improve your music knowledge"
                items={[
                  "Practice at your own pace",
                  "Beat your highscore",
                  "Unlock achievements",
                ]}
                buttonLabel="Play solo"
                buttonColor="oklch(0.57 0.1482 275.78)"
                emoji="🎵"
              />

              <ModeCard
                icon="/multiplayer.svg"
                title="Multiplayer"
                description="Create a room and play with your friends"
                items={[
                  "Create or join a room",
                  "Compete live",
                  "Climb the leaderboards",
                ]}
                buttonLabel="Play with friends"
                buttonClassName="play-button"
                emoji="👥"
              />
            </div>
          </div>

          {/* 📦 boczny panel */}
          <div className="absolute top-1/2 right-0 -translate-y-1/2 translate-x-1/2 hidden xl:block">
            <InfoCard />
          </div>
        </div>
      </div>

      <div className="text-center text-xs opacity-50 pb-4">
        © 2026 Muzzly
      </div>
    </main>
  );
}

function ModeCard({
  icon,
  title,
  description,
  items,
  buttonLabel,
  buttonColor,
  buttonClassName,
  emoji,
}: any) {
  return (
    <div className="w-[360px] rounded-[20px] bg-[oklch(0.2403_0.0137_272.76)] text-white px-6 py-6 flex flex-col items-center text-center">
      
      <Image src={icon} alt="" width={56} height={56} className="h-[56px] w-auto" />

      <h2 className="mt-3 text-[24px] font-semibold">{title}</h2>

      <p className="mt-2 text-[14px] opacity-60 max-w-[240px]">
        {description}
      </p>

      <div className="w-full text-left mt-5 space-y-3">
        {items.map((text: string, i: number) => (
          <div key={i} className="flex items-center gap-3 text-[14px] opacity-80">
            <div className="h-5 w-5 flex items-center justify-center rounded-full bg-white/10 text-[10px]">
              {emoji}
            </div>
            {text}
          </div>
        ))}
      </div>

      <div className="mt-6">
        {buttonClassName ? (
          <button className={`${buttonClassName} !px-10 !py-2 text-sm`}>
            {buttonLabel}
          </button>
        ) : (
          <button
            className="rounded-xl px-10 py-2 text-sm font-semibold text-white"
            style={{ background: buttonColor }}
          >
            {buttonLabel}
          </button>
        )}
      </div>
    </div>
  );
}

function InfoCard() {
  return (
    <div className="w-[240px] rounded-[20px] bg-[oklch(0.2403_0.0137_272.76)] text-white px-6 py-6 shadow-xl relative">
      
      <div className="absolute top-3 right-4 text-xl">🎵</div>

      <h3 className="text-[20px] font-semibold">How it works?</h3>

      <div className="mt-6">
        <Step number="1" text="Choose a mode" />
        <Step number="2" text="Guess songs fast" />
        <Step number="3" text="Earn points & win" last />
      </div>
    </div>
  );
}

function Step({ number, text, last }: any) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className="h-6 w-6 rounded-full bg-purple-500/30 flex items-center justify-center text-xs">
          {number}
        </div>
        {!last && <div className="w-px h-6 bg-white/20" />}
      </div>
      <div className="text-[14px] opacity-80 pb-3">{text}</div>
    </div>
  );
}