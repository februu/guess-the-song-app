"use client";

import { useEffect, useState, startTransition } from "react";
import { useRouter } from "next/navigation";
import { ThemeToggle } from "../theme-toggle";
import { gameWS } from "@/lib/ws/client";
import type { RoomState } from "@/lib/api/messages";

export default function LobbyPage() {
  const router = useRouter();
  const [roomState,    setRoomState]    = useState<RoomState | null>(null);
  const [myNickname,   setMyNickname]   = useState("");
  const [isHost,       setIsHost]       = useState(false);
  const [copied,       setCopied]       = useState(false);
  const [error,        setError]        = useState("");
  const [starting,     setStarting]     = useState(false);
  const [playlistName, setPlaylistName] = useState("");
  const [playlistImage,setPlaylistImage]= useState("");

  useEffect(() => {
    // Request fresh room state on mount
    gameWS.onMessage // already subscribed

  // Also re-read sessionStorage on mount — it was updated by /game via room.updated
    const raw  = sessionStorage.getItem("room_state");
    const nick = sessionStorage.getItem("my_nickname") ?? "";
    const host = sessionStorage.getItem("is_host") === "true";

    // If there's no room state in sessionStorage, it means the user accessed the lobby page directly without joining or creating a room, 
    // so we redirect them back to the multiplayer page.
    if (!raw) { router.replace("/multiplayer"); return; }

    // Initialize the lobby state with the data from sessionStorage and set up a WebSocket listener for room updates and game start events
    const initialState = JSON.parse(raw) as RoomState;
    setRoomState(initialState);
    setMyNickname(nick);
    setIsHost(host);
    setPlaylistName(sessionStorage.getItem("playlist_name") ?? "");
    setPlaylistImage(sessionStorage.getItem("playlist_image") ?? "");

    // Subscribe to WebSocket messages to receive real-time updates about the room state and game events
    const unsubscribe = gameWS.onMessage((msg) => {
      if (!msg.ok) { setError(msg.error?.message ?? "An error occurred"); return; }

      if (msg.type === "room.updated") {
        const state = msg.data.state as RoomState;
        setRoomState(state);
        sessionStorage.setItem("room_state", JSON.stringify(state));
        setIsHost(state.host_name === nick);
        if (state.playlist_name) { setPlaylistName(state.playlist_name); sessionStorage.setItem("playlist_name", state.playlist_name); }
        if (state.playlist_img)  { setPlaylistImage(state.playlist_img);  sessionStorage.setItem("playlist_image", state.playlist_img); }
      }

      if (msg.type === "room.started") startTransition(() => router.push("/game?mode=multiplayer"));
    });

    return () => unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handles the "Leave" button click: disconnects from the game WebSocket and navigates back to the home page
  function handleLeave()   { gameWS.disconnect(); router.push("/"); } 

  // Handles the "Back" button click: disconnects from the game WebSocket and navigates back to the multiplayer page 
  function handleBack()    { gameWS.disconnect(); router.push("/multiplayer"); } 

  // Handles the "Copy" button click: copies the room code to the clipboard and shows a temporary "Copied!" message
  function handleCopy()    {
    if (!roomState) return;
    navigator.clipboard.writeText(roomState.code).catch(() => {});
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  }
  // Handles the "Ready" button click: sends a ready message to the server to indicate that the player is ready to start the game
  function handleReady()   { gameWS.send({ type: "room.ready", data: {} }); }

  // Handles the "Start game" button click: sends a start message to the server to initiate the game start process (only available to the host)
  function handleStart()   { setStarting(true); gameWS.send({ type: "room.start", data: {} }); }

  if (!roomState) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-sm opacity-50">Loading lobby…</p>
      </main>
    );
  }

  // Determine if the current player is marked as ready in the room state
  const amReady = (roomState.ready_players ?? []).includes(myNickname);

  return (
    <main className="min-h-screen flex flex-col bg-background text-foreground overflow-hidden">
      <div className="flex-1 flex items-center justify-center px-6 py-6">
        <div className="w-full max-w-[1200px] h-[650px] rounded-[28px]
          bg-[oklch(0.9821_0_0)] text-black border border-black/15
          dark:bg-[oklch(0.2178_0_0)] dark:text-white dark:border-white/8
          overflow-hidden flex">

          {/* ── LEFT SIDEBAR ── */}
          <div className="w-[180px] flex-shrink-0 flex flex-col border-r border-black/8 dark:border-white/8 px-4 py-5 gap-3">

            <div className="flex items-center">
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
              onClick={handleBack}
              className="flex items-center gap-2 rounded-none px-3 py-2 text-xs font-semibold text-red-500 opacity-80 hover:opacity-100 hover:bg-red-500/10 transition-all text-left w-full border border-black/10 dark:border-white/10"
            >
              ← Leave
            </button>

            <div className="h-px bg-black/10 dark:bg-white/10 my-1" />

            {/* Playlist */}
            <div className="flex-1 flex flex-col items-center gap-3 pt-2">
              {playlistImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={playlistImage} alt="Playlist" className="w-[120px] h-[120px] rounded-[12px] object-cover shadow-lg opacity-90" />
              ) : (
                <div className="w-[120px] h-[120px] rounded-[12px] bg-black/10 dark:bg-white/10 flex items-center justify-center text-4xl">🎵</div>
              )}
              {(roomState.playlist_name || playlistName) && (
                <p className="text-xs font-semibold text-center opacity-60 leading-tight line-clamp-3 px-1">
                  {roomState.playlist_name || playlistName}
                </p>
              )}
              <p className="text-xs opacity-30">{roomState.rounds} rounds</p>
            </div>
          </div>

          {/* ── MAIN AREA ── */}
          <div className="flex-1 flex flex-col items-center px-10 pt-10 pb-8 min-w-0">

            <div className="absolute top-0 right-0 w-[300px] h-[300px] rounded-full bg-green-500/8 blur-[100px] pointer-events-none" />

            <h1 className="text-6xl font-bold tracking-wide leading-none">MUZZLY</h1>
            <p className="mt-3 text-sm opacity-40 tracking-widest uppercase">Lobby</p>
            <div className="w-32 h-0.5 mt-2 bg-gradient-to-r from-transparent via-green-500/60 to-transparent" />

            <div className="flex-1 flex items-center justify-center w-full max-w-[480px]">
              <div className="flex flex-col gap-15 w-full">

                {/* Room code */}
                <div className="w-full rounded-[20px] overflow-hidden border border-black/8 dark:border-white/8">
                  <div className="px-6 py-3 flex items-center gap-3 bg-[oklch(0.84_0.005_272)] dark:bg-[oklch(0.26_0.015_272.76)] border-b border-black/8 dark:border-white/8">
                    <p className="text-xs font-bold opacity-40 uppercase tracking-widest">Room code</p>
                  </div>
                  <div className="px-6 py-4 flex items-center justify-between bg-[oklch(0.88_0.005_272)] dark:bg-[oklch(0.2403_0.0137_272.76)]">
                    <span className="text-3xl font-black tracking-[0.25em]">{roomState.code}</span>
                    <button
                      onClick={handleCopy}
                      className="flex items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-xs font-semibold transition-all bg-black/8 dark:bg-white/8 hover:bg-black/15 dark:hover:bg-white/15"
                    >
                      {copied ? "✓ Copied!" : "📋 Copy"}
                    </button>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-col items-center gap-3">
                  {isHost ? (
                    <button onClick={handleStart} disabled={starting} className="play-button disabled:opacity-50">
                      {starting ? "Starting…" : "Start game!"}
                    </button>
                  ) : (
                    <button onClick={handleReady} className={`play-button ${amReady ? "opacity-60" : ""}`}>
                      {amReady ? "✓ Ready!" : "I'm ready"}
                    </button>
                  )}
                  {!isHost && (
                    <p className="text-xs opacity-30">
                      {amReady ? "Waiting for host to start…" : "Mark yourself ready, then wait for the host"}
                    </p>
                  )}
                </div>

                {error && <p className="text-xs text-red-400 text-center">{error}</p>}

              </div>
            </div>
          </div>

          {/* ── RIGHT SIDEBAR ── */}
          <div className="w-[180px] flex-shrink-0 flex flex-col border-l border-black/8 dark:border-white/8 px-4 py-5 gap-3">

            <p className="text-xs font-bold opacity-40 uppercase tracking-widest">
              Players ({roomState.members.length})
            </p>
            <div className="w-full h-0.5 bg-gradient-to-r from-green-500/80 to-transparent" />

            <div className="flex-1 flex flex-col gap-1 overflow-y-auto min-h-0">
              {roomState.members.map((name) => {
                const isMe       = name === myNickname;
                const isThisHost = name === roomState.host_name;
                const ready      = (roomState.ready_players ?? []).includes(name);
                return (
                  <div
                    key={name}
                    className={`flex items-center gap-2 px-2 py-2 rounded-[10px] ${isMe ? "bg-green-500/15" : ""}`}
                  >
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0 ${isMe ? "bg-green-500 text-white" : "bg-black/10 dark:bg-white/10"}`}>
                      {name[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-semibold truncate ${isMe ? "text-green-600 dark:text-green-400" : ""}`}>
                        {name}
                      </p>
                      {isThisHost && <p className="text-xs opacity-40">host</p>}
                    </div>
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${ready ? "bg-green-500" : "bg-black/15 dark:bg-white/15"}`} />
                  </div>
                );
              })}
            </div>

            <div className="h-px bg-black/10 dark:bg-white/10" />
            <div className="text-center">
              <p className="text-xs opacity-40">Waiting</p>
              <p className="text-lg font-black">
                {(roomState.ready_players ?? []).length}
                <span className="text-xs opacity-40 font-normal">/{roomState.members.length}</span>
              </p>
              <p className="text-xs opacity-30">ready</p>
            </div>

          </div>

        </div>
      </div>
      <div className="text-center text-xs opacity-30 pb-4">© 2026 Muzzly</div>
    </main>
  );
}