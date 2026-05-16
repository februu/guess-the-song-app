"use client";

import Image from "next/image";
export interface Player {
  name: string;
  score: number;
  isMe: boolean;
}

interface Props {
  mode: "singleplayer" | "multiplayer";
  players?: Player[];
  playlist?: string;
  nickname?: string;
  score?: number;
}

export function SidePanel({ mode, players = [], playlist, nickname, score }: Props) {
  return (
    <div className="w-[200px] rounded-[20px] px-5 py-6 shadow-xl flex flex-col items-center gap-4 bg-[oklch(0.93_0.005_272)] text-gray-800 dark:bg-[oklch(0.2403_0.0137_272.76)] dark:text-white">
      <Image
        src="/cat.gif"
        alt="Game cat"
        width={100}
        height={100}
        className="w-[100px] h-auto opacity-90"
      />

      {mode === "multiplayer" ? (
        <div className="w-full flex flex-col gap-1">
          <p className="text-xs opacity-50 text-center mb-1">Scoreboard</p>
          {[...players].sort((a, b) => b.score - a.score).map((p) => (
            <div key={p.name} className="flex items-center gap-1.5 text-xs">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${p.isMe ? "bg-green-500" : "bg-black/20 dark:bg-white/20"}`} />
              <span className={`font-semibold truncate ${p.isMe ? "text-green-600 dark:text-green-400" : ""}`}>
                {p.name}
              </span>
              <span className="ml-auto opacity-50 tabular-nums">{p.score}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="w-full flex flex-col items-center gap-2">
          <p className="text-xs opacity-50">Your score</p>
          <p className="text-2xl font-black tabular-nums">{score ?? 0}</p>
          <p className="text-xs opacity-40 text-center">
            {nickname && <span className="font-semibold">{nickname}</span>}
          </p>
        </div>
      )}

      {playlist && (
        <>
          <div className="w-full h-px bg-black/10 dark:bg-white/10" />
          <p className="text-xs opacity-40 text-center">
            Playlist:<br />
            <span className="opacity-70">{playlist}</span>
          </p>
        </>
      )}
    </div>
  );
}