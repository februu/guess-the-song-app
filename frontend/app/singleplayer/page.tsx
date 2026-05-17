"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ThemeToggle } from "../theme-toggle";

import {
  redirectToSpotifyLogin,
  spotifyLogout,
  tryLoadSpotifySession,
  type SpotifyPlaylist,
  type SpotifyProfile,
} from "@/lib/spotify";
import { gameWS } from "@/lib/ws/client";
import type { RoomState } from "@/lib/api/messages";

import { UserProfileCard } from "../multiplayer/_components/UserProfileCard";
import { PlaylistRow } from "../multiplayer/_components/PlaylistRow";

let userLoggedOut = false;
let sessionLoadStarted = false;

const isValidName = (v: string) => /^[a-zA-Z0-9_]{3,20}$/.test(v);

// Spotify SVG icon
function SpotifyIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
    </svg>
  );
}

// This component implements the singleplayer game setup flow, which consists of 3 steps:
// 1. Connect Spotify account
// 2. Pick a playlist from the user's Spotify playlists
// 3. Configure game settings (nickname, rounds) and start the game
type Step = "connect" | "pick-playlist" | "configure";

export default function SingleplayerPage() {
  const router = useRouter();

  const [step,             setStep]             = useState<Step>("connect");
  const [loading,          setLoading]          = useState(false);
  const [error,            setError]            = useState("");
  const [profile,          setProfile]          = useState<SpotifyProfile | null>(null);
  const [playlists,        setPlaylists]        = useState<SpotifyPlaylist[]>([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState<SpotifyPlaylist | null>(null);
  const [nickname,         setNickname]         = useState("");
  const [rounds,           setRounds]           = useState(10);
  const [nameError,        setNameError]        = useState("");
  const [starting,         setStarting]         = useState(false);

  useEffect(() => {
    sessionLoadStarted = false; // reset on component mount
    userLoggedOut = false; // reset on component mount
    const params      = new URLSearchParams(window.location.search); // check if we're coming back from Spotify login redirect
    const isPostLogin = params.get("spotify") === "connected"; // if so, we can skip the loading state and just load the session directly, since we know the Spotify data is now available
    if (isPostLogin) { // if we're coming back from Spotify login, we can skip the loading state and just load the session directly, since we know the Spotify data is now available
      userLoggedOut = false // reset logout flag, since the user just logged in
      window.history.replaceState({}, "", "/singleplayer"); // clean up URL
      loadSession(false); // load session without showing loading state, since we know the data is ready
    } else {
      loadSession(true); // otherwise, try to load session
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Loads the Spotify session (profile + playlists) and updates state accordingly. 
  async function loadSession(silent: boolean) {
    if (silent && userLoggedOut) return; 
    try {
      if (!silent) setLoading(true);
      setError("");
      const session = await tryLoadSpotifySession();
      if (!session) { setStep("connect"); return; }
      setProfile(session.profile);
      setPlaylists(session.playlists);
      setNickname(session.profile.display_name?.replace(/\W/g, "_").slice(0, 20) ?? "");
      setStep("pick-playlist");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load Spotify data");
      setStep("connect");
    } finally {
      setLoading(false);
    }
  }

  // Handles user logout: calls the Spotify logout endpoint, clears session state, and resets to the initial step
  async function handleLogout() {
    userLoggedOut = true; sessionLoadStarted = false;
    try { await spotifyLogout(); } catch { /* best-effort */ }
    setProfile(null); setPlaylists([]); setSelectedPlaylist(null);
    setNickname(""); setStep("connect");
  }

  // Handles playlist selection: sets the selected playlist and moves to the configuration step. 
  function handlePlaylistSelect(playlist: SpotifyPlaylist) {
    setSelectedPlaylist(playlist);
    if (playlist.track_count && rounds > playlist.track_count) setRounds(playlist.track_count);
    setStep("configure");
  }

  // Handles the "Start game" button click: 
  // validates input, connects to the game WebSocket, 
  // creates a new room, and navigates to the game page on success.
  async function handleStart() {
    if (!isValidName(nickname)) { setNameError("3–20 chars, letters, numbers or underscores only"); return; }
    if (!selectedPlaylist) { setError("Select a playlist first"); return; }

    setStarting(true); setError("");

    try { await gameWS.connect(); } catch {
      setError("Could not connect to server"); setStarting(false); return;
    }

    const unsubscribe = gameWS.onMessage((msg) => {
      if (!msg.ok) { setError(msg.error?.message ?? "Failed to start game"); setStarting(false); unsubscribe(); return; }
      if (msg.type === "room.updated") {
        const state = msg.data.state as RoomState;
        if (!state.started) {
          sessionStorage.setItem("room_state",    JSON.stringify(state));
          sessionStorage.setItem("my_nickname",   nickname);
          sessionStorage.setItem("is_host",       "true");
          sessionStorage.setItem("playlist_name", selectedPlaylist.name);
          sessionStorage.setItem("playlist_image",selectedPlaylist.image_url ?? "");
          gameWS.send({ type: "room.start", data: {} });
        }
      }
      if (msg.type === "room.started") { unsubscribe(); router.push("/game?mode=singleplayer"); }
    });

    gameWS.send({
      type: "room.create",
      data: { name: nickname, playlist_id: selectedPlaylist.id, playlist_name: selectedPlaylist.name, playlist_img: selectedPlaylist.image_url ?? "", rounds },
    });

    setTimeout(() => {
      if (starting) { unsubscribe(); setError("Server did not respond, try again"); setStarting(false); }
    }, 10000);
  }

  // The maximum number of rounds is either the number of tracks in the selected playlist (if available) or a default of 20
  const maxRounds = selectedPlaylist?.track_count || 20;

  // Handles the "Back" button click: navigates back to the previous step in the setup flow
  function handleBack() {
    if (step === "configure") setStep("pick-playlist");
    else if (step === "pick-playlist") setStep("connect");
  }

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
              onClick={() => { gameWS.disconnect(); router.push("/"); }}
              className="flex items-center gap-2 rounded-none px-3 py-2 text-xs font-semibold opacity-70 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5 transition-all text-left w-full border border-black/10 dark:border-white/10"
            >
              🏠 Home
            </button>
            {step !== "connect" && (
              <button
                onClick={handleBack}
                className="flex items-center gap-2 rounded-none px-3 py-2 text-xs font-semibold opacity-70 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5 transition-all text-left w-full border border-black/10 dark:border-white/10"
              >
                ← Back
              </button>
            )}

            <div className="h-px bg-black/10 dark:bg-white/10 my-1" />

            <div className="flex-1 flex flex-col gap-3 pt-1">
              <p className="text-xs font-bold opacity-40 uppercase tracking-widest">How to play</p>
              <div className="flex flex-col gap-3">
                {[
                  { n: "1", t: "Connect Spotify" },
                  { n: "2", t: "Pick a playlist" },
                  { n: "3", t: "Set rounds" },
                  { n: "4", t: "Guess songs!" },
                ].map(({ n, t }, i, arr) => (
                  <div key={n} className="flex gap-2.5 items-start">
                    <div className="flex flex-col items-center flex-shrink-0">
                      <div className="w-5 h-5 rounded-full bg-green-500/20 dark:bg-green-500/30 flex items-center justify-center text-xs font-bold text-green-600 dark:text-green-400">
                        {n}
                      </div>
                      {i < arr.length - 1 && <div className="w-px h-4 bg-black/10 dark:bg-white/10" />}
                    </div>
                    <p className="text-xs opacity-50 leading-tight pt-0.5">{t}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── MAIN CONTENT ── */}
          <div className="flex-1 flex flex-col items-center px-10 pt-10 pb-8 min-w-0">
            <div className="absolute top-0 right-0 w-[300px] h-[300px] rounded-full bg-green-500/8 blur-[100px] pointer-events-none" />

            <h1 className="text-6xl font-bold tracking-wide leading-none">MUZZLY</h1>
            <p className="mt-3 text-sm opacity-40 tracking-widest uppercase">Solo</p>
            <div className="w-32 h-0.5 mt-2 bg-gradient-to-r from-transparent via-green-500/60 to-transparent" />

            <div className="flex-1 flex items-center justify-center w-full max-w-[500px]">

              {/* ── CONNECT ── */}
              {step === "connect" && (
                <div className="w-full flex flex-col items-center gap-4">
                  <div className="w-full rounded-[20px] overflow-hidden border border-black/8 dark:border-white/8">
                    <div className="px-6 py-5 flex items-center gap-4" style={{ background: "#1DB954" }}>
                      <div className="w-10 h-10 rounded-full bg-black/10 flex items-center justify-center text-black flex-shrink-0">
                        <SpotifyIcon size={22} />
                      </div>
                      <div className="text-left">
                        <p className="font-black text-black text-base leading-none">Spotify</p>
                        <p className="text-black/50 text-xs mt-0.5">Music streaming</p>
                      </div>
                      <div className="ml-auto w-2 h-2 rounded-full bg-black/20" />
                    </div>
                    <div className="px-6 py-5 flex flex-col gap-4 bg-[oklch(0.88_0.005_272)] dark:bg-[oklch(0.2403_0.0137_272.76)]">
                      <p className="text-sm opacity-60 leading-relaxed">
                        Connect your Spotify account to browse your playlists and start playing solo.
                      </p>
                      <button
                        onClick={() => redirectToSpotifyLogin("/singleplayer")}
                        className="flex items-center justify-center gap-2.5 w-full rounded-[10px] px-5 py-3 font-bold text-black text-sm transition-all hover:opacity-90 active:scale-[0.98]"
                        style={{ background: "#1DB954" }}
                      >
                        <SpotifyIcon size={16} />
                        Connect with Spotify
                      </button>
                      {loading && (
                        <div className="flex items-center justify-center gap-2">
                          {[0,1,2].map(i => (
                            <div key={i} className="w-1.5 h-1.5 rounded-full bg-green-500"
                              style={{ animation: `bounce 1s ease-in-out ${i * 0.15}s infinite` }} />
                          ))}
                          <span className="text-xs opacity-40 ml-1">Loading playlists…</span>
                        </div>
                      )}
                      {error && <p className="text-xs text-red-400 text-center">{error}</p>}
                    </div>
                  </div>
                  <style jsx>{`
                    @keyframes bounce {
                      0%, 100% { transform: translateY(0); opacity: 0.4; }
                      50%       { transform: translateY(-4px); opacity: 1; }
                    }
                  `}</style>
                </div>
              )}

              {/* ── PICK PLAYLIST ── */}
              {step === "pick-playlist" && (
                <div className="flex flex-col gap-3 w-full">
                  {profile && <UserProfileCard profile={profile} onLogout={handleLogout} />}
                  <p className="text-sm opacity-60">Select a playlist to start</p>
                  <div className="rounded-[16px] overflow-y-auto max-h-[360px] bg-[oklch(0.88_0.005_272)] dark:bg-[oklch(0.2403_0.0137_272.76)]">
                    {playlists.length > 0 ? (
                      playlists.map((p) => (
                        <PlaylistRow key={p.id} playlist={p} selected={selectedPlaylist?.id === p.id} onClick={() => handlePlaylistSelect(p)} />
                      ))
                    ) : (
                      <p className="text-sm opacity-50 p-4">No playlists found</p>
                    )}
                  </div>
                  {error && <p className="text-xs text-red-400">{error}</p>}
                </div>
              )}

              {/* ── CONFIGURE ── */}
              {step === "configure" && (
                <div className="flex flex-col gap-4 w-full">
                  {profile && <UserProfileCard profile={profile} onLogout={handleLogout} />}

                  {selectedPlaylist && (
                    <div className="flex items-center gap-3 rounded-[12px] px-4 py-3 bg-[oklch(0.88_0.005_272)] text-gray-800 dark:bg-[oklch(0.2403_0.0137_272.76)] dark:text-white">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={selectedPlaylist.image_url ?? "/playlist-placeholder.png"} alt="" className="w-10 h-10 rounded-[8px] object-cover" />
                      <div>
                        <p className="text-sm font-semibold">{selectedPlaylist.name}</p>
                        <p className="text-xs opacity-50">{selectedPlaylist.track_count ? `${selectedPlaylist.track_count} tracks` : "Spotify playlist"}</p>
                      </div>
                      <button onClick={() => setStep("pick-playlist")} className="ml-auto text-xs opacity-50 hover:opacity-80 transition-opacity">Change</button>
                    </div>
                  )}

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

                  <div className="flex flex-col gap-1">
                    <label className="text-xs opacity-50">Rounds: {rounds}</label>
                    <input type="range" min={1} max={maxRounds} value={rounds}
                      onChange={(e) => setRounds(Number(e.target.value))} className="accent-green-500" />
                    <div className="flex justify-between text-xs opacity-30"><span>1</span><span>{maxRounds}</span></div>
                  </div>

                  {error && <p className="text-xs text-red-400">{error}</p>}

                  <button className="play-button mx-auto mt-2 disabled:opacity-50" onClick={handleStart} disabled={starting}>
                    {starting ? "Starting…" : "Start game!"}
                  </button>
                </div>
              )}

            </div>
          </div>

          {/* ── RIGHT SIDEBAR ── */}
          <div className="w-[180px] flex-shrink-0 flex flex-col border-l border-black/8 dark:border-white/8 px-4 py-5 gap-3">
            <p className="text-xs font-bold opacity-40 uppercase tracking-widest">Tips</p>
            <div className="w-full h-0.5 bg-gradient-to-r from-green-500/80 to-transparent" />
            <div className="flex-1 flex flex-col gap-4 pt-2">
              {[
                { emoji: "🎵", tip: "Listen carefully - even a few notes are enough" },
                { emoji: "⚡", tip: "Faster guesses earn more points" },
                { emoji: "🔊", tip: "Use headphones for best experience" },
                { emoji: "🎯", tip: "Partial matches count - just type the song name" },
              ].map(({ emoji, tip }) => (
                <div key={tip} className="flex gap-2.5 items-start">
                  <span className="text-base flex-shrink-0">{emoji}</span>
                  <p className="text-xs opacity-40 leading-relaxed">{tip}</p>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
      <div className="text-center text-xs opacity-30 pb-4">© 2026 Muzzly</div>
    </main>
  );
}