"use client";

interface Props {
  nickname: string;
  score: number;
  round: number;
  totalRounds: number;
}

export function SingleplayerLayout({ nickname, score, round, totalRounds }: Props) {
  return (
    <div className="rounded-[16px] px-6 py-5 bg-[oklch(0.88_0.005_272)] dark:bg-[oklch(0.2403_0.0137_272.76)] flex items-center gap-4">
      <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center text-lg font-bold text-green-600 dark:text-green-400">
        {nickname[0]?.toUpperCase() ?? "?"}
      </div>
      <div className="flex flex-col">
        <span className="text-sm font-semibold">{nickname}</span>
        <span className="text-xs opacity-40">
          Round {round} of {totalRounds}
        </span>
      </div>
      <div className="ml-auto flex flex-col items-end">
        <span className="text-xl font-black tabular-nums">{score}</span>
        <span className="text-xs opacity-40">points</span>
      </div>
    </div>
  );
}