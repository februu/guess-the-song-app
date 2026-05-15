"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { gameWS } from "@/lib/ws/client";
import type { RoomState } from "@/lib/api/messages";

const isValidName = (v: string) => /^[a-zA-Z0-9_]{3,20}$/.test(v);
const isValidCode = (v: string) => /^[a-zA-Z]{6}$/.test(v);

export function JoinView() {
  const router = useRouter();
  const [nickname,  setNickname]  = useState("");
  const [code,      setCode]      = useState("");
  const [nameError, setNameError] = useState("");
  const [codeError, setCodeError] = useState("");
  const [error,     setError]     = useState("");
  const [joining,   setJoining]   = useState(false);

  async function handleJoin() {
    let valid = true;
    if (!isValidName(nickname)) { setNameError("3–20 chars, letters, numbers or underscores only"); valid = false; }
    if (!isValidCode(code))     { setCodeError("Code must be exactly 6 letters"); valid = false; }
    if (!valid) return;

    setJoining(true); setError("");

    try { await gameWS.connect(); } catch {
      setError("Could not connect to server"); setJoining(false); return;
    }

    const unsubscribe = gameWS.onMessage((msg) => {
      if (!msg.ok) {
        setError(msg.error?.message ?? "Failed to join room");
        setJoining(false); unsubscribe(); return;
      }
      if (msg.type === "room.updated") {
        unsubscribe();
        const state = msg.data.state as RoomState;
        sessionStorage.setItem("room_state",   JSON.stringify(state));
        sessionStorage.setItem("my_nickname",  nickname);
        sessionStorage.setItem("is_host",      "false");
        router.push("/lobby");
      }
    });

    gameWS.send({ type: "room.join", data: { name: nickname, code: code.toUpperCase() } });

    setTimeout(() => {
      if (joining) { unsubscribe(); setError("Server did not respond, try again"); setJoining(false); }
    }, 8000);
  }

  return (
    <div className="w-full flex flex-col gap-4">

      <div className="w-full rounded-[20px] overflow-hidden border border-black/8 dark:border-white/8">

        {/* Header */}
        <div className="px-6 py-4 flex items-center gap-3 bg-[oklch(0.84_0.005_272)] dark:bg-[oklch(0.26_0.015_272.76)] border-b border-black/8 dark:border-white/8">
          <div className="w-8 h-8 rounded-[8px] bg-green-500/20 flex items-center justify-center text-base">🔗</div>
          <p className="font-black tracking-wide text-sm">JOIN ROOM</p>
          <div className="ml-auto w-1.5 h-1.5 rounded-full bg-green-500/40" />
        </div>

        {/* Fields */}
        <div className="px-6 py-5 flex flex-col gap-4 bg-[oklch(0.88_0.005_272)] dark:bg-[oklch(0.2403_0.0137_272.76)]">

          <div className="flex flex-col gap-1.5">
            <label className="text-xs opacity-50 uppercase tracking-widest">Your nickname</label>
            <input
              value={nickname}
              onChange={(e) => { setNickname(e.target.value); setNameError(""); }}
              placeholder="e.g. awesomeDJ99"
              className="rounded-[10px] px-4 py-2.5 text-sm outline-none
                bg-[oklch(0.92_0.005_272)] dark:bg-[oklch(0.2178_0_0)]
                text-gray-800 dark:text-white
                placeholder:opacity-30
                border border-black/8 dark:border-white/8
                focus:border-green-500/50 transition-colors"
            />
            {nameError && <p className="text-xs text-red-400">{nameError}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs opacity-50 uppercase tracking-widest">Room code</label>
            <input
              value={code}
              onChange={(e) => { setCode(e.target.value.toUpperCase()); setCodeError(""); }}
              placeholder="ABCDEF"
              maxLength={6}
              className="rounded-[10px] px-4 py-2.5 text-sm outline-none tracking-[0.3em] font-black
                bg-[oklch(0.92_0.005_272)] dark:bg-[oklch(0.2178_0_0)]
                text-gray-800 dark:text-white
                placeholder:opacity-30 placeholder:tracking-normal placeholder:font-normal
                border border-black/8 dark:border-white/8
                focus:border-green-500/50 transition-colors"
            />
            {codeError && <p className="text-xs text-red-400">{codeError}</p>}
          </div>

          {error && <p className="text-xs text-red-400 text-center">{error}</p>}

          <button
            onClick={handleJoin}
            disabled={joining}
            className="w-full rounded-[10px] py-3 text-sm font-black tracking-wide
              bg-green-500 text-black
              hover:bg-green-400 disabled:opacity-40 disabled:cursor-not-allowed
              transition-all active:scale-[0.98]"
          >
            {joining ? "Joining…" : "Join room →"}
          </button>

        </div>
      </div>

    </div>
  );
}