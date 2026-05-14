"use client";

export interface Player {
  name: string;
  score: number;
  isMe: boolean;
}

interface Props {
  players: Player[];
}

export function MultiplayerLayout({ players }: Props) {
  const sorted = [...players].sort((a, b) => b.score - a.score);

  return (
    <div className="rounded-[16px] overflow-hidden bg-[oklch(0.88_0.005_272)] dark:bg-[oklch(0.2403_0.0137_272.76)]">
      {sorted.map((p, i) => (
        <div
          key={p.name}
          className={`flex items-center gap-3 px-4 py-3 border-b border-black/5 dark:border-white/5 last:border-0 ${
            p.isMe ? "bg-green-500/10" : ""
          }`}
        >
          <span className="text-xs opacity-40 w-4 text-right">{i + 1}.</span>
          <div className="w-7 h-7 rounded-full bg-black/10 dark:bg-white/10 flex items-center justify-center text-xs font-bold">
            {p.name[0].toUpperCase()}
          </div>
          <span className="text-sm font-semibold">
            {p.name}
            {p.isMe && <span className="ml-1 text-xs opacity-40">(you)</span>}
          </span>
          <span className="ml-auto text-sm font-bold tabular-nums">
            {p.score} <span className="text-xs opacity-40">pts</span>
          </span>
        </div>
      ))}
    </div>
  );
}