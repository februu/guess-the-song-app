"use client";

import { useState } from "react";
import { buildClientMessage } from "@/lib/api/messages";

const isValidName = (v: string) => /^[a-zA-Z0-9_]{3,20}$/.test(v);
const isValidCode = (v: string) => /^[a-zA-Z]{6}$/.test(v);

export function JoinView() {
  const [nickname, setNickname] = useState("");
  const [code, setCode]         = useState("");
  const [nameError, setNameError] = useState("");
  const [codeError, setCodeError] = useState("");

  function handleJoin() {
    let valid = true;

    if (!isValidName(nickname)) {
      setNameError("3–20 chars, letters, numbers or underscores only");
      valid = false;
    }
    if (!isValidCode(code)) {
      setCodeError("Code must be exactly 6 letters");
      valid = false;
    }
    if (!valid) return;

    const msg = buildClientMessage({
      type: "room.join",
      data: { name: nickname, code: code.toUpperCase() },
    });

    // TODO: send via WebSocket
    console.log("WS send:", msg);
  }

  return (
    <div className="flex flex-col gap-4 text-left w-full">
      {/* Nickname */}
      <div className="flex flex-col gap-1">
        <label className="text-xs opacity-50">Your nickname</label>
        <input
          value={nickname}
          onChange={(e) => { setNickname(e.target.value); setNameError(""); }}
          placeholder="e.g. awesomeDJ99"
          className="rounded-[12px] px-4 py-2 text-sm outline-none bg-[oklch(0.88_0.005_272)] text-gray-800 placeholder:opacity-30 dark:bg-[oklch(0.2403_0.0137_272.76)] dark:text-white border border-transparent focus:border-white/20"
        />
        {nameError && <p className="text-xs text-red-400">{nameError}</p>}
      </div>

      {/* Room code */}
      <div className="flex flex-col gap-1">
        <label className="text-xs opacity-50">Room code</label>
        <input
          value={code}
          onChange={(e) => { setCode(e.target.value.toUpperCase()); setCodeError(""); }}
          placeholder="ABCDEF"
          maxLength={6}
          className="rounded-[12px] px-4 py-2 text-sm outline-none tracking-widest font-semibold bg-[oklch(0.88_0.005_272)] text-gray-800 placeholder:opacity-30 dark:bg-[oklch(0.2403_0.0137_272.76)] dark:text-white border border-transparent focus:border-white/20"
        />
        {codeError && <p className="text-xs text-red-400">{codeError}</p>}
      </div>

      <button className="play-button mx-auto mt-2" onClick={handleJoin}>
        Join room!
      </button>
    </div>
  );
}