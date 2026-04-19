import Image from "next/image";
import { ThemeToggle } from "./theme-toggle";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col bg-background text-foreground overflow-hidden">
      <div className="flex-1 flex items-center justify-center px-6 py-6">

        {/* Main container card */}
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
          {/* Theme toggle button — top left corner */}
          <div className="absolute top-4 left-4 z-10 bg-black/10 dark:bg-black/30 backdrop-blur-md rounded-full p-2">
            <ThemeToggle />
          </div>

          {/* Page content — centered vertically and horizontally */}
          <div className="h-full flex flex-col items-center justify-center text-center px-10">

            {/* App title */}
            <h1 className="text-6xl font-bold tracking-wide leading-none">
              MUZZLY
            </h1>

            {/* Subtitle */}
            <p className="mt-4 text-sm opacity-50">
              Guess songs with your friends!
            </p>

            {/* Section heading */}
            <p className="mt-6 text-xl font-medium">
              Choose your game mode
            </p>

            {/* Game mode cards */}
            <div className="mt-8 flex gap-6">

              {/* Singleplayer mode card */}
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
                emoji="🎵"
              />

              {/* Multiplayer mode card */}
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

          {/* Side info panel — only visible on xl screens, floats outside the card on the right */}
          <div className="absolute top-1/2 right-0 -translate-y-1/2 translate-x-1/2 hidden xl:block">
            <InfoCard />
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center text-xs opacity-50 pb-4">
        © 2026 Muzzly
      </div>
    </main>
  );
}

// Card component for a single game mode (singleplayer or multiplayer)
function ModeCard({
  icon,        // path to the mode icon SVG
  title,       // card heading
  description, // short description below the heading
  items,       // list of feature bullet points
  buttonLabel, // text on the CTA button
  buttonClassName, // optional CSS class for the button (e.g. "play-button" from global.css)
  emoji,       // emoji shown in each feature row icon
}: any) {
  return (
    <div className="
      w-[360px] rounded-[20px] px-6 py-6 flex flex-col items-center text-center
      bg-[oklch(0.93_0.005_272)] text-gray-800
      dark:bg-[oklch(0.2403_0.0137_272.76)] dark:text-white
    ">

      {/* Mode icon */}
      <Image src={icon} alt="" width={56} height={56} className="h-[56px] w-auto" />

      {/* Mode title */}
      <h2 className="mt-3 text-[24px] font-semibold">{title}</h2>

      {/* Mode description */}
      <p className="mt-2 text-[14px] opacity-60 max-w-[240px]">
        {description}
      </p>

      {/* Feature list */}
      <div className="w-full text-left mt-5 space-y-3">
        {items.map((text: string, i: number) => (
          <div key={i} className="flex items-center gap-3 text-[14px] opacity-70">
            {/* Emoji icon bubble */}
            <div className="h-5 w-5 flex items-center justify-center rounded-full bg-black/10 dark:bg-white/10 text-[10px]">
              {emoji}
            </div>
            {text}
          </div>
        ))}
      </div>

      {/* CTA button — uses .play-button class from global.css if buttonClassName is provided */}
      <div className="mt-6 w-full flex justify-center">
        {buttonClassName ? (
          <button className={buttonClassName}>
            {buttonLabel}
          </button>
        ) : (
          <button className="play-button">
            {buttonLabel}
          </button>
        )}
      </div>
    </div>
  );
}

// Side panel explaining how the game works — floats outside the main card on xl screens
function InfoCard() {
  return (
    <div className="
      w-[240px] rounded-[20px] px-6 py-6 shadow-xl relative
      bg-[oklch(0.93_0.005_272)] text-gray-800
      dark:bg-[oklch(0.2403_0.0137_272.76)] dark:text-white
    ">

      {/* Decorative emoji */}
      <div className="absolute top-3 right-4 text-xl">🎵</div>

      <h3 className="text-[20px] font-semibold">How it works?</h3>

      {/* Numbered steps with connecting line */}
      <div className="mt-6">
        <Step number="1" text="Choose a mode" />
        <Step number="2" text="Guess songs fast" />
        <Step number="3" text="Earn points & win" last />
      </div>
    </div>
  );
}

// Single step row used inside InfoCard
// Renders a numbered circle, a vertical connector line (except on the last step), and the step text
function Step({ number, text, last }: any) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        {/* Step number bubble */}
        <div className="h-6 w-6 rounded-full bg-purple-500/20 dark:bg-purple-500/30 flex items-center justify-center text-xs">
          {number}
        </div>
        {/* Vertical connector line — hidden on the last step */}
        {!last && <div className="w-px h-6 bg-black/15 dark:bg-white/20" />}
      </div>
      <div className="text-[14px] opacity-70 pb-3">{text}</div>
    </div>
  );
}