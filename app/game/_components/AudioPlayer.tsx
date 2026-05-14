"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  totalSeconds?: number;
  onTimeUp?: () => void;
}

export function AudioPlayer({ totalSeconds = 30, onTimeUp }: Props) {
  const [seconds, setSeconds] = useState(totalSeconds);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setSeconds(totalSeconds);
    intervalRef.current = setInterval(() => {
      setSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(intervalRef.current!);
          onTimeUp?.();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(intervalRef.current!);
  }, [totalSeconds, onTimeUp]);

  const progress = (seconds / totalSeconds) * 100;
  const isUrgent = seconds <= 10;

  return (
    <div className="w-full rounded-[20px] px-6 py-6 bg-[oklch(0.88_0.005_272)] dark:bg-[oklch(0.2403_0.0137_272.76)] flex flex-col items-center gap-4">

      {/* Waveform bars */}
      <div className="flex items-end gap-1 h-12">
        {Array.from({ length: 32 }).map((_, i) => (
          <div
            key={i}
            className={`w-1.5 rounded-full opacity-80 ${isUrgent ? "bg-red-500" : "bg-green-500"}`}
            style={{
              height: `${20 + Math.sin(i * 0.8) * 15 + Math.cos(i * 0.4) * 10}px`,
              animation: `wave ${0.5 + (i % 5) * 0.1}s ease-in-out infinite alternate`,
              animationDelay: `${i * 0.03}s`,
            }}
          />
        ))}
      </div>

      {/* Timer bar */}
      <div className="flex items-center gap-3 w-full max-w-[200px]">
        <div className="flex-1 h-1.5 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-1000 ${isUrgent ? "bg-red-500" : "bg-green-500"}`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className={`text-sm font-bold tabular-nums w-8 text-right ${isUrgent ? "text-red-500" : ""}`}>
          {seconds}s
        </span>
      </div>

      <p className="text-xs opacity-40">🎵 Listening…</p>

      <style jsx>{`
        @keyframes wave {
          from { transform: scaleY(0.6); }
          to   { transform: scaleY(1.2); }
        }
      `}</style>
    </div>
  );
}