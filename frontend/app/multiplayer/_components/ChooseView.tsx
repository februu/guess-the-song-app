"use client";

import type { View } from "./MultiplayerShell";

interface Props {
  onChoose: (v: View) => void;
}

export function ChooseView({ onChoose }: Props) {
  return (
    <div className="flex flex-col gap-5 w-full">

      {/* Create room */}
      <button
        onClick={() => onChoose("create")}
        className="group w-full rounded-[20px] px-6 py-6 flex items-center gap-5 text-left transition-all duration-200
          bg-[oklch(0.88_0.005_272)] dark:bg-[oklch(0.2403_0.0137_272.76)]
          border border-black/10 dark:border-white/8
          hover:border-green-500/40 hover:bg-[oklch(0.85_0.005_272)] dark:hover:bg-[oklch(0.27_0.015_272.76)]"
      >
        <div className="w-12 h-12 rounded-[12px] bg-green-500/15 flex items-center justify-center text-2xl flex-shrink-0">
          🎮
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <p className="font-black tracking-wide">CREATE ROOM</p>
            <span className="text-green-500 text-sm opacity-0 group-hover:opacity-100 transition-opacity">→</span>
          </div>
          <div className="w-16 h-0.5 mt-1 bg-gradient-to-r from-green-500/60 to-transparent" />
          <p className="text-xs opacity-40 mt-1.5 leading-relaxed">
            Pick a playlist, set rounds, invite friends
          </p>
        </div>
      </button>

      {/* Divider */}
      <div className="flex items-center gap-3 opacity-20">
        <div className="flex-1 h-px bg-current" />
        <span className="text-xs font-semibold uppercase tracking-widest">or</span>
        <div className="flex-1 h-px bg-current" />
      </div>

      {/* Join room */}
      <button
        onClick={() => onChoose("join")}
        className="group w-full rounded-[20px] px-6 py-6 flex items-center gap-5 text-left transition-all duration-200
          bg-[oklch(0.88_0.005_272)] dark:bg-[oklch(0.2403_0.0137_272.76)]
          border border-black/10 dark:border-white/8
          hover:border-green-500/40 hover:bg-[oklch(0.85_0.005_272)] dark:hover:bg-[oklch(0.27_0.015_272.76)]"
      >
        <div className="w-12 h-12 rounded-[12px] bg-green-500/15 flex items-center justify-center text-2xl flex-shrink-0">
          🔗
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <p className="font-black tracking-wide">JOIN ROOM</p>
            <span className="text-green-500 text-sm opacity-0 group-hover:opacity-100 transition-opacity">→</span>
          </div>
          <div className="w-16 h-0.5 mt-1 bg-gradient-to-r from-green-500/60 to-transparent" />
          <p className="text-xs opacity-40 mt-1.5 leading-relaxed">
            Enter a room code and jump in
          </p>
        </div>
      </button>

    </div>
  );
}