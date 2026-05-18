"use client";

import { useEffect, useState, startTransition } from "react";
import { useRouter } from "next/navigation";

import {
  redirectToSpotifyLogin,
  spotifyLogout,
  tryLoadSpotifySession,
  type SpotifyPlaylist,
  type SpotifyProfile,
} from "@/lib/spotify";
import { gameWS } from "@/lib/ws/client";
import type { RoomState } from "@/lib/api/messages";

import { UserProfileCard } from "./UserProfileCard";
import { PlaylistRow } from "./PlaylistRow";

const isValidName = (v: string) => /^[a-zA-Z0-9_]{3,20}$/.test(v);

// This component manages the "Create Room" flow in the multiplayer mode.
// It has three main steps:
// 1. "connect": prompts the user to connect their Spotify account if not already connected.
// 2. "pick-playlist": displays the user's Spotify playlists and allows them to select one for the game.
// 3. "configure": lets the user set their nickname and number of rounds before creating the room.
export type CreateStep = "connect" | "pick-playlist" | "configure";

let userLoggedOut = false;
let sessionLoadStarted = false;

function SpotifyIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
    </svg>
  );
}

interface Props {
  initialStep?: CreateStep;
  onStepChange?: (step: CreateStep) => void;
}

export function CreateView({ initialStep, onStepChange }: Props) { 
  const router = useRouter();

  const [step, setStepInternal] = useState<CreateStep>(initialStep ?? "connect");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");

  const [profile,          setProfile]          = useState<SpotifyProfile | null>(null);
  const [playlists,        setPlaylists]        = useState<SpotifyPlaylist[]>([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState<SpotifyPlaylist | null>(null);

  const [nickname,  setNickname]  = useState("");
  const [rounds,    setRounds]    = useState(10);
  const [nameError, setNameError] = useState("");
  const [creating,  setCreating]  = useState(false);

  function setStep(s: CreateStep) { // internal step setter that also notifies parent component of changes
    setStepInternal(s); // update local state
    onStepChange?.(s); // notify parent of step change
  }

  // Sync when parent changes initialStep (e.g. Back button)
  useEffect(() => {
    if (initialStep) setStepInternal(initialStep);
  }, [initialStep]);

  // On mount, try to load Spotify session. 
  // This handles the case where the user is redirected back from Spotify login, as well as returning users who have an active session. 
  // We use a flag to ensure this only runs once, even if the component re-renders.
  useEffect(() => {
    if (sessionLoadStarted) return;
    sessionLoadStarted = true;

    const params = new URLSearchParams(window.location.search);
    const isPostLogin = params.get("spotify") === "connected";

    if (isPostLogin) {
      userLoggedOut = false;
      window.history.replaceState({}, "", "/multiplayer");
      loadSpotifyData(false);
    } else {
      loadSpotifyData(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Loads the user's Spotify profile and playlists.
  async function loadSpotifyData(silent: boolean) {
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

  // Handles the "Create room" button click: validates input, connects to the game WebSocket, 
  // creates a new room, and navigates to the lobby on success.
  function handlePlaylistSelect(p: SpotifyPlaylist) {
    setSelectedPlaylist(p);
    if (p.track_count && rounds > p.track_count) setRounds(p.track_count);
    setStep("configure");
  }

  // Handles user logout: calls the Spotify logout endpoint, clears session state, and resets to the initial step
  async function handleLogout() {
    userLoggedOut = true;
    sessionLoadStarted = false;
    try { await spotifyLogout(); } catch { /* best-effort */ }
    setProfile(null); setPlaylists([]); setSelectedPlaylist(null);
    setNickname(""); setStep("connect");
  }

  // Handles the "Create room" button click: validates input, connects to the game WebSocket, creates a new room, 
  // and navigates to the lobby on success.
  async function handleCreate() {
    if (!isValidName(nickname)) { setNameError("3–20 chars, letters, numbers or underscores only"); return; }
    if (!selectedPlaylist) { setError("Select a playlist first"); return; }

    setCreating(true); setError("");

    try { await gameWS.connect(); } catch {
      setError("Could not connect to server"); setCreating(false); return;
    }
    // Listen for server responses to the room creation request. On success, save the room state and navigate to the lobby.
    const unsubscribe = gameWS.onMessage((msg) => {
      if (!msg.ok) {
        setError(msg.error?.message ?? "Failed to create room");
        setCreating(false); unsubscribe(); return;
      }
      if (msg.type === "room.updated") {
        unsubscribe();
        const state = msg.data.state as RoomState;
        sessionStorage.setItem("room_state",    JSON.stringify(state));
        sessionStorage.setItem("my_nickname",   nickname);
        sessionStorage.setItem("is_host",       "true");
        sessionStorage.setItem("playlist_name", selectedPlaylist.name);
        sessionStorage.setItem("playlist_image",selectedPlaylist.image_url ?? "");
        startTransition(() => router.push("/lobby"));
      }
    });
    // Send the room creation request to the server with the selected playlist and configuration options
    gameWS.send({
      type: "room.create",
      data: {
        name:          nickname,
        playlist_id:   selectedPlaylist.id,
        playlist_name: selectedPlaylist.name,
        playlist_img:  selectedPlaylist.image_url ?? "",
        rounds,
      },
    });

    setTimeout(() => {
      if (creating) { unsubscribe(); setError("Server did not respond, try again"); setCreating(false); }
    }, 8000);
  }

  // ── CONNECT ── //
  if (step === "connect") {
    return (
      <div className="w-full flex flex-col items-center gap-4">
        <div className="w-full rounded-[20px] overflow-hidden border border-black/8 dark:border-white/8">

          {/* Green header */}
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

          {/* Body */}
          <div className="px-6 py-5 flex flex-col gap-4 bg-[oklch(0.88_0.005_272)] dark:bg-[oklch(0.2403_0.0137_272.76)]">
            <p className="text-sm opacity-60 leading-relaxed">
              Connect your Spotify account to browse your playlists and start the game.
            </p>
            <button
              onClick={() => redirectToSpotifyLogin("/multiplayer")}
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
    );
  }

  // ── PICK PLAYLIST ── //
  if (step === "pick-playlist") {
    return (
      <div className="flex flex-col gap-3 w-full">
        {profile && <UserProfileCard profile={profile} onLogout={handleLogout} />}
        <p className="text-sm opacity-60">Select a playlist</p>
        <div className="rounded-[16px] overflow-y-auto max-h-[320px] bg-[oklch(0.88_0.005_272)] dark:bg-[oklch(0.2403_0.0137_272.76)]">
          {playlists.length > 0 ? (
            playlists.map((p) => (
              <PlaylistRow
                key={p.id}
                playlist={p}
                selected={selectedPlaylist?.id === p.id}
                onClick={() => handlePlaylistSelect(p)}
              />
            ))
          ) : (
            <p className="text-sm opacity-50 p-4">No playlists found</p>
          )}
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    );
  }

  // ── CONFIGURE ── //
  return (
    <div className="flex flex-col gap-4 w-full">
      {profile && <UserProfileCard profile={profile} onLogout={handleLogout} />}

      {selectedPlaylist && (
        <div className="flex items-center gap-3 rounded-[12px] px-4 py-3 bg-[oklch(0.88_0.005_272)] text-gray-800 dark:bg-[oklch(0.2403_0.0137_272.76)] dark:text-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={selectedPlaylist.image_url ?? "/playlist-placeholder.png"} alt="" className="w-10 h-10 rounded-[8px] object-cover" />
          <div>
            <p className="text-sm font-semibold">{selectedPlaylist.name}</p>
            <p className="text-xs opacity-50">
              {selectedPlaylist.track_count ? `${selectedPlaylist.track_count} tracks` : "Spotify playlist"}
            </p>
          </div>
          <button onClick={() => setStep("pick-playlist")} className="ml-auto text-xs opacity-50 hover:opacity-80 transition-opacity">
            Change
          </button>
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
        <input
          type="range" min={1} max={selectedPlaylist?.track_count || 20} value={rounds}
          onChange={(e) => setRounds(Number(e.target.value))}
          className="accent-green-500"
        />
        <div className="flex justify-between text-xs opacity-30">
          <span>1</span><span>{selectedPlaylist?.track_count || 20}</span>
        </div>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <button
        className="play-button mx-auto mt-2 disabled:opacity-50"
        onClick={handleCreate}
        disabled={creating}
      >
        {creating ? "Creating…" : "Create room!"}
      </button>
    </div>
  );
}