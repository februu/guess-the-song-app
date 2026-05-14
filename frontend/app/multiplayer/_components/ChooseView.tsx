"use client";

import type { View } from "./MultiplayerShell";

interface Props {
  onChoose: (v: View) => void;
}

export function ChooseView({ onChoose }: Props) {
  return (
    <div className="flex flex-col items-center gap-4 w-full">
      <button className="play-button" onClick={() => onChoose("create")}>
        Create room
      </button>
      <p className="text-sm opacity-50">or</p>
      <button className="play-button" onClick={() => onChoose("join")}>
        Join room
      </button>
    </div>
  );
}