"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ThemeToggle } from "../theme-toggle";
import { gameWS } from "@/lib/ws/client";
import type { RoomState, SongResult } from "@/lib/api/messages";
import { useAudioPlayer } from "./_components/useAudioPlayer";

type GamePhase = "waiting" | "playing" | "reveal" | "ended";

interface RoundInfo {
  round: number;
  totalRounds: number;
  duration: number;
}

function getInitialRoomState(): RoomState | null {
  try {
    const raw = sessionStorage.getItem("room_state");
    return raw ? (JSON.parse(raw) as RoomState) : null;
  } catch { return null; }
}

function GameContent() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const mode         = (searchParams.get("mode") ?? "multiplayer") as "singleplayer" | "multiplayer";

  const myNickname    = useRef(sessionStorage.getItem("my_nickname") ?? "");
  const playlistName  = sessionStorage.getItem("playlist_name") ?? "";
  const playlistImage = sessionStorage.getItem("playlist_image") ?? "";

  const [phase,       setPhase]      = useState<GamePhase>("waiting");
  const [roundInfo,   setRoundInfo]  = useState<RoundInfo | null>(null);
  const [roomState,   setRoomState]  = useState<RoomState | null>(() => getInitialRoomState());
  const [reveal,      setReveal]     = useState<SongResult | null>(null);
  const [wsError,     setWsError]    = useState("");
  const [guess,       setGuess]      = useState("");
  const [guessResult, setGuessResult] = useState<"correct" | "incorrect" | null>(null);
  const [points,      setPoints]     = useState(0);
  const [timeLeft,    setTimeLeft]   = useState(0);
  const [volume,      setVolume]     = useState(1);
  const [muted,       setMuted]      = useState(false);

  const timerRef       = useRef<ReturnType<typeof setInterval> | null>(null);
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audio          = useAudioPlayer();
  const channelsRef    = useRef(2);

  function handleLeave() {
  audio.stop();
  gameWS.disconnect();
  router.push("/");
}
  function handleLeaveToLobby() {
  audio.stop();
  gameWS.disconnect();
  router.push(mode === "singleplayer" ? "/singleplayer" : "/lobby");
}
  function handleBackToLobby() { router.push("/lobby"); }
  function handlePlayAgain() { gameWS.disconnect(); router.push("/singleplayer"); }

  function handleVolumeChange(v: number) {
    setVolume(v); setMuted(v === 0); audio.setVolume(v);
  }
  function handleToggleMute() {
    const n = !muted; setMuted(n); audio.setVolume(n ? 0 : volume);
  }

  useEffect(() => {
    const unsub = gameWS.onMessage((msg) => {
      if (!msg.ok) { setWsError(msg.error?.message ?? "An error occurred"); return; }

      switch (msg.type) {
        case "round.started": {
          const { round, total_rounds, duration } = msg.data;
          setRoundInfo({ round, totalRounds: total_rounds, duration });
          setPhase("playing");
          setGuess(""); setGuessResult(null); setPoints(0);
          setTimeLeft(duration);
          if (timerRef.current) clearInterval(timerRef.current);
          timerRef.current = setInterval(() => {
            setTimeLeft((t) => { if (t <= 1) { clearInterval(timerRef.current!); return 0; } return t - 1; });
          }, 1000);
          break;
        }
        case "round.audio_config": {
          const { sampleRate, channels } = msg.data;
          channelsRef.current = channels;
          audio.init({ sampleRate, channels });
          break;
        }
        case "round.audio_stop": audio.stop(); break;
        case "round.audio_end": break;
        case "song.correct": {
          const result = msg.data as SongResult;
          setGuessResult("correct"); setPoints(result.points);
          break;
        }
        case "song.incorrect":
          setGuessResult("incorrect");
          setTimeout(() => setGuessResult(null), 1000);
          break;
        case "round.ended": {
          clearInterval(timerRef.current!); audio.stop();
          const result = msg.data as SongResult;
          setReveal(result); setPhase("reveal");
          if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
          revealTimerRef.current = setTimeout(() => {
            setPhase((c) => c === "reveal" ? "waiting" : c);
            setReveal(null);
          }, 3000);
          break;
        }
        case "room.updated": setRoomState(msg.data.state as RoomState); break;
        case "room.ended": {
          clearInterval(timerRef.current!); clearTimeout(revealTimerRef.current!);
          audio.stop();
          setRoomState(msg.data.state as RoomState); setPhase("ended");
          break;
        }
      }
    });

    const unsubBinary = gameWS.onBinary((buf) => audio.playChunk(buf, channelsRef.current));

    return () => {
      unsub(); unsubBinary();
      clearInterval(timerRef.current!);
      clearTimeout(revealTimerRef.current!);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submitGuess = useCallback(() => {
    const trimmed = guess.trim();
    if (!trimmed || guessResult === "correct" || phase !== "playing") return;
    gameWS.send({ type: "song.guess", data: { guess: trimmed } });
    setGuess("");
  }, [guess, guessResult, phase]);

  const allMembers    = roomState?.members ?? [];
  const scoreboard    = roomState?.scoreboard ?? {};
  const sortedPlayers = [...allMembers].sort((a, b) => (scoreboard[b] ?? 0) - (scoreboard[a] ?? 0));
  const myScore       = scoreboard[myNickname.current] ?? 0;

  // ── ENDED ─────────────────────────────────────────────────────────────────
  if (phase === "ended" && roomState) {
    return (
      <main className="min-h-screen flex flex-col bg-background text-foreground overflow-hidden">
        <div className="flex-1 flex items-center justify-center px-6 py-6">
          <div className="w-full max-w-[560px] rounded-[28px] bg-[oklch(0.9821_0_0)] text-black dark:bg-[oklch(0.2178_0_0)] dark:text-white px-10 py-12 flex flex-col items-center gap-6">
            <h1 className="text-5xl font-black tracking-wide">MUZZLY</h1>
            <p className="text-sm opacity-50">Game over!</p>
            <div className="w-full rounded-[16px] overflow-hidden bg-[oklch(0.88_0.005_272)] dark:bg-[oklch(0.2403_0.0137_272.76)]">
              {sortedPlayers.map((name, i) => (
                <div key={name} className={`flex items-center gap-3 px-4 py-3 border-b border-black/5 dark:border-white/5 last:border-0 ${name === myNickname.current ? "bg-green-500/10" : ""}`}>
                  <span className="text-sm font-black opacity-40 w-5">{i + 1}.</span>
                  <div className="w-8 h-8 rounded-full bg-black/10 dark:bg-white/10 flex items-center justify-center text-sm font-bold">{name[0].toUpperCase()}</div>
                  <span className="text-sm font-semibold">{name}{name === myNickname.current && <span className="ml-1 text-xs opacity-40">(you)</span>}</span>
                  {i === 0 && <span className="ml-1">🏆</span>}
                  <span className="ml-auto text-base font-black tabular-nums">{scoreboard[name] ?? 0} <span className="text-xs opacity-40">pts</span></span>
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              {mode === "singleplayer"
                ? <button onClick={handlePlayAgain} className="play-button">Play again</button>
                : <button onClick={() => { gameWS.disconnect(); router.push("/multiplayer"); }} className="play-button">New game</button>
              }
              <button onClick={handleLeave} className="rounded-[14px] px-6 py-2 text-sm font-semibold bg-black/10 dark:bg-white/10 hover:bg-black/20 dark:hover:bg-white/20 transition-colors">🏠 Home</button>
            </div>
          </div>
        </div>
        <div className="text-center text-xs opacity-50 pb-4">© 2026 Muzzly</div>
      </main>
    );
  }

  const isUrgent   = timeLeft <= 10;
  const timerWidth = roundInfo ? (timeLeft / roundInfo.duration) * 100 : 0;

  return (
    <main className="min-h-screen flex flex-col bg-background text-foreground overflow-hidden">
      <div className="flex-1 flex items-center justify-center px-6 py-6">
        <div className="w-full max-w-[1200px] h-[650px] rounded-[28px] bg-[oklch(0.9821_0_0)] text-black dark:bg-[oklch(0.2178_0_0)] dark:text-white overflow-hidden flex">

          {/* ── LEFT SIDEBAR ── */}
          <div className="w-[180px] flex-shrink-0 flex flex-col border-r border-black/8 dark:border-white/8 px-4 py-5 gap-3">
            <div className="flex items-center gap-2">
              <div className="bg-black/10 dark:bg-black/30 rounded-full p-1.5">
                <ThemeToggle />
              </div>
            </div>
            <button
              onClick={handleLeave}
              className="flex items-center gap-2 rounded-none px-3 py-2 text-xs font-semibold opacity-70 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5 transition-all text-left w-full border border-black/10 dark:border-white/10"
            >
              🏠 Home
            </button>
            <button
              onClick={handleLeaveToLobby}
              className="flex items-center gap-2 rounded-none px-3 py-2 text-xs font-semibold text-red-500 opacity-80 hover:opacity-100 hover:bg-red-500/10 transition-all text-left w-full border border-black/10 dark:border-white/10"
            >
              ← Leave
            </button>

            <div className="h-px bg-black/10 dark:bg-white/10 my-1" />

            {/* Playlist cover + name */}
            <div className="flex-1 flex flex-col items-center gap-3 pt-2">
              {playlistImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={playlistImage}
                  alt="Playlist"
                  className="w-[120px] h-[120px] rounded-[12px] object-cover shadow-lg opacity-90"
                />
              ) : (
                <div className="w-[120px] h-[120px] rounded-[12px] bg-black/10 dark:bg-white/10 flex items-center justify-center text-4xl">
                  🎵
                </div>
              )}
              {playlistName && (
                <p className="text-xs font-semibold text-center opacity-60 leading-tight line-clamp-3 px-1">
                  {playlistName}
                </p>
              )}
            </div>
          </div>

          {/* ── MAIN AREA ── */}
          <div className="flex-1 flex flex-col items-center px-8 pt-10 pb-8 min-w-0">
            <h1 className="text-6xl font-bold tracking-wide leading-none">MUZZLY</h1>
            <p className="mt-3 text-sm opacity-50">
              {phase === "waiting" && "Get ready for the next round…"}
              {phase === "playing" && "Guess the song!"}
              {phase === "reveal"  && "Here's the answer!"}
            </p>
            <div className="w-full max-w-[500px] h-0.5 mt-2 bg-gradient-to-r from-transparent via-green-500/60 to-transparent" />

            <div className="flex-1 flex items-center justify-center w-full max-w-[500px]">
              <div className="flex flex-col gap-5 w-full">

                {/* REVEAL */}
                {phase === "reveal" && reveal && (
                  <div className="w-full rounded-[20px] px-6 py-6 bg-[oklch(0.88_0.005_272)] dark:bg-[oklch(0.2403_0.0137_272.76)] flex flex-col items-center gap-4">
                    {reveal.img && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={reveal.img} alt="Song cover" className="w-28 h-28 rounded-[14px] object-cover shadow-xl" />
                    )}
                    <div className="text-center">
                      <p className="text-2xl font-black">{reveal.title}</p>
                      <p className="text-sm opacity-60 mt-1">{reveal.artist}</p>
                    </div>
                    {reveal.points > 0
                      ? <p className="text-green-500 font-bold text-lg">+{reveal.points} points</p>
                      : <p className="text-sm opacity-40">Better luck next round!</p>
                    }
                  </div>
                )}

                {/* WAITING */}
                {phase === "waiting" && (
                  <div className="w-full rounded-[20px] px-6 py-10 bg-[oklch(0.88_0.005_272)] dark:bg-[oklch(0.2403_0.0137_272.76)] flex flex-col items-center gap-4">
                    <div className="flex gap-2">
                      {[0,1,2].map(i => (
                        <div key={i} className="w-3 h-3 rounded-full bg-green-500 opacity-60"
                          style={{ animation: `bounce 1s ease-in-out ${i * 0.2}s infinite` }} />
                      ))}
                    </div>
                    <p className="text-sm opacity-50">Next round starting soon…</p>
                  </div>
                )}

                {/* PLAYING */}
                {phase === "playing" && (
                  <>
                    <div className="w-full rounded-[20px] px-6 py-6 bg-[oklch(0.88_0.005_272)] dark:bg-[oklch(0.2403_0.0137_272.76)] flex flex-col items-center gap-5">
                      <div className="flex items-end gap-1 h-16 w-full justify-center">
                        {Array.from({ length: 40 }).map((_, i) => (
                          <div
                            key={i}
                            className={`w-1.5 rounded-full ${isUrgent ? "bg-red-500" : "bg-green-500"} opacity-80`}
                            style={{
                              height: `${22 + Math.sin(i * 0.7) * 18 + Math.cos(i * 0.4) * 10}px`,
                              animation: `wave ${0.4 + (i % 7) * 0.08}s ease-in-out infinite alternate`,
                              animationDelay: `${i * 0.03}s`,
                            }}
                          />
                        ))}
                      </div>
                      <div className="flex items-center gap-3 w-full">
                        <div className="flex-1 h-2 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-1000 ${isUrgent ? "bg-red-500" : "bg-green-500"}`}
                            style={{ width: `${timerWidth}%` }}
                          />
                        </div>
                        <span className={`text-sm font-black tabular-nums w-10 text-right ${isUrgent ? "text-red-500" : ""}`}>
                          {timeLeft}s
                        </span>
                      </div>
                      <div className="flex items-center gap-3 w-full">
                        <button onClick={handleToggleMute} className="text-lg opacity-60 hover:opacity-100 transition-opacity w-6 text-center">
                          {muted || volume === 0 ? "🔇" : volume < 0.5 ? "🔉" : "🔊"}
                        </button>
                        <input
                          type="range" min={0} max={1} step={0.05}
                          value={muted ? 0 : volume}
                          onChange={(e) => handleVolumeChange(Number(e.target.value))}
                          className="flex-1 accent-green-500 h-1"
                        />
                      </div>
                    </div>

                    {guessResult === "correct" && (
                      <div className="rounded-[12px] px-5 py-3 text-sm font-semibold text-center bg-green-500/20 text-green-600 dark:text-green-400">
                        ✓ Correct! +{points} points — waiting for round to end…
                      </div>
                    )}
                    {guessResult === "incorrect" && (
                      <div className="rounded-[12px] px-5 py-3 text-sm font-semibold text-center bg-red-500/20 text-red-500">
                        ✗ Wrong — try again!
                      </div>
                    )}

                    {guessResult !== "correct" && (
                      <div className="flex gap-2">
                        <input
                          value={guess}
                          onChange={(e) => setGuess(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && submitGuess()}
                          placeholder="Type your guess…"
                          maxLength={100}
                          autoFocus
                          className="flex-1 rounded-[12px] px-4 py-3 text-sm outline-none bg-[oklch(0.88_0.005_272)] text-gray-800 placeholder:opacity-30 dark:bg-[oklch(0.2403_0.0137_272.76)] dark:text-white border border-transparent focus:border-white/20"
                        />
                        <button
                          onClick={submitGuess}
                          disabled={!guess.trim()}
                          className="rounded-[12px] px-5 py-3 text-sm font-semibold bg-green-500 text-white hover:bg-green-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                          Guess!
                        </button>
                      </div>
                    )}
                  </>
                )}

                {/* Singleplayer score */}
                {phase !== "waiting" && mode === "singleplayer" && (
                  <div className="rounded-[16px] px-6 py-4 bg-[oklch(0.88_0.005_272)] dark:bg-[oklch(0.2403_0.0137_272.76)] flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center text-lg font-bold text-green-600 dark:text-green-400">
                      {myNickname.current[0]?.toUpperCase() ?? "?"}
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{myNickname.current}</p>
                      <p className="text-xs opacity-40">Round {roundInfo?.round ?? 0} of {roundInfo?.totalRounds ?? 0}</p>
                    </div>
                    <div className="ml-auto text-right">
                      <p className="text-xl font-black tabular-nums">{myScore}</p>
                      <p className="text-xs opacity-40">points</p>
                    </div>
                  </div>
                )}

                {wsError && <p className="text-xs text-red-400 text-center">{wsError}</p>}
              </div>
            </div>
          </div>

          {/* ── RIGHT SIDEBAR (multiplayer only) ── */}
          {mode === "multiplayer" && (
            <div className="w-[180px] flex-shrink-0 flex flex-col border-l border-black/8 dark:border-white/8 px-4 py-5 gap-3">
              <p className="text-xs font-bold opacity-40 uppercase tracking-widest">SCOREBOARD</p>
              <div className="w-full h-0.5 bg-gradient-to-r from-green-500/80 to-transparent" />

              <div className="flex-1 flex flex-col gap-1 overflow-y-auto min-h-0">
                {sortedPlayers.length > 0 ? sortedPlayers.map((name, i) => {
                  const score = scoreboard[name] ?? 0;
                  const isMe  = name === myNickname.current;
                  return (
                    <div
                      key={name}
                      className={`flex items-center gap-2 px-2 py-2 rounded-[10px] ${isMe ? "bg-green-500/15" : ""}`}
                    >
                      <span className="text-xs opacity-30 w-3 font-bold flex-shrink-0">{i + 1}</span>
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0 ${isMe ? "bg-green-500 text-white" : "bg-black/10 dark:bg-white/10"}`}>
                        {name[0].toUpperCase()}
                      </div>
                      <span className={`text-xs font-semibold truncate flex-1 ${isMe ? "text-green-600 dark:text-green-400" : ""}`}>
                        {name}
                      </span>
                      <span className="text-sm font-black tabular-nums flex-shrink-0">{score}</span>
                    </div>
                  );
                }) : (
                  <p className="text-xs opacity-30 px-1">Loading…</p>
                )}
              </div>

              <div className="h-px bg-black/10 dark:bg-white/10" />
              <div className="text-center">
                <p className="text-xs opacity-40">Round</p>
                <p className="text-2xl font-black leading-none">
                  {roundInfo?.round ?? "—"}
                  <span className="text-xs opacity-40 font-normal">/{roundInfo?.totalRounds ?? "—"}</span>
                </p>
              </div>
            </div>
          )}

        </div>
      </div>

      <style jsx>{`
        @keyframes wave {
          from { transform: scaleY(0.5); }
          to   { transform: scaleY(1.4); }
        }
        @keyframes bounce {
          0%, 100% { transform: translateY(0); opacity: 0.4; }
          50%       { transform: translateY(-8px); opacity: 1; }
        }
      `}</style>

      <div className="text-center text-xs opacity-50 pb-4">© 2026 Muzzly</div>
    </main>
  );
}

export default function GamePage() {
  return (
    <Suspense>
      <GameContent />
    </Suspense>
  );
}