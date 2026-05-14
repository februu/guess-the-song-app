"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  redirectToSpotifyLogin,
  spotifyLogout,
  tryLoadSpotifySession,
  type SpotifyPlaylist,
  type SpotifyProfile,
} from "@/lib/spotify";
import { buildClientMessage } from "@/lib/api/messages";

import { UserProfileCard } from "./UserProfileCard";
import { PlaylistRow } from "./PlaylistRow";

const isValidName = (v: string) => /^[a-zA-Z0-9_]{3,20}$/.test(v);

type Step = "connect" | "pick-playlist" | "configure";

// Module-level flags — survive React Strict Mode unmount/remount cycles
let userLoggedOut = false;
let sessionLoadStarted = false;

export function CreateView() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("connect");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [profile, setProfile] = useState<SpotifyProfile | null>(null);
  const [playlists, setPlaylists] = useState<SpotifyPlaylist[]>([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState<SpotifyPlaylist | null>(null);

  const [nickname, setNickname] = useState("");
  const [rounds, setRounds] = useState(10);
  const [nameError, setNameError] = useState("");

  // On mount 
  useEffect(() => {
     console.log("useEffect fired, sessionLoadStarted:", sessionLoadStarted);
    // Prevent double execution from React Strict Mode
    if (sessionLoadStarted) return;
    sessionLoadStarted = true;

    const params = new URLSearchParams(window.location.search);
    const isPostLogin = params.get("spotify") === "connected";

    if (isPostLogin) {
      userLoggedOut = false;
      // Clean URL immediately — synchronously before any async work
      window.history.replaceState({}, "", "/multiplayer");
      loadSpotifyData(false);
    } else {
      loadSpotifyData(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Data loader 
  async function loadSpotifyData(silent: boolean) {
    if (silent && userLoggedOut) return;

    try {
      if (!silent) setLoading(true);
      setError("");

      const session = await tryLoadSpotifySession();
      if (!session) {
        setStep("connect");
        return;
      }

      setProfile(session.profile);
      setPlaylists(session.playlists);
      setNickname(
        session.profile.display_name?.replace(/\W/g, "_").slice(0, 20) ?? ""
      );
      setStep("pick-playlist");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load Spotify data");
      setStep("connect");
    } finally {
      setLoading(false);
    }
  }

  //  Logout 
  async function handleLogout() {
    console.log("handleLogout called");
    userLoggedOut = true;
    sessionLoadStarted = false; // allow fresh load after next login
    try {
      await spotifyLogout();
    } catch {
      // best-effort
    }
    setProfile(null);
    setPlaylists([]);
    setSelectedPlaylist(null);
    setNickname("");
    setStep("connect");
  }

  
  function handleStart() {
    if (!isValidName(nickname)) {
      setNameError("3–20 chars, letters, numbers or underscores only");
      return;
    }
    if (!selectedPlaylist) {
      setError("Select a playlist first");
      return;
    }

    // TODO: pass playlist id + rounds + nickname to game
    console.log("Starting multiplayer:", { nickname, playlist_id: selectedPlaylist.id, rounds });
    router.push("/game?mode=multiplayer");
  }

  function handlePlaylistSelect(p: SpotifyPlaylist) {
    setSelectedPlaylist(p);
    setStep("configure");
  }

function handleCreate() {
  if (!isValidName(nickname)) {
    setNameError("3–20 chars, letters, numbers or underscores only");
    return;
  }

  if (!selectedPlaylist) {
    setError("Select a playlist first");
    return;
  }

  const ws = new WebSocket("ws://localhost:8000/ws/game/");

  ws.onopen = () => {
    ws.send(JSON.stringify({
      type: "room.create",
      data: {
        username: nickname,
        playlist_id: selectedPlaylist.id,
        rounds,
      },
    }));
  };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);

    if (msg.type === "room.created") {
      router.push(`/lobby?code=${msg.data.room_code}`);
    }

    if (msg.type === "error") {
      setError(msg.message ?? "Failed to create room");
    }
  };

  ws.onerror = () => {
    setError("WebSocket connection failed");
  };
}

  // Render

  if (step === "connect") {
    return (
      <div className="flex flex-col items-center gap-6 w-full">
        <p className="text-base font-medium text-center">
          Connect your Spotify account to load your playlists
        </p>

        <button
          onClick={() => redirectToSpotifyLogin("/multiplayer")}
          className="flex items-center gap-2 rounded-xl px-8 py-2 font-semibold text-white text-sm"
          style={{ background: "#1DB954" }}
        >
          Connect Spotify
        </button>

        {loading && <p className="text-xs opacity-50">Loading Spotify…</p>}
        {error && <p className="text-xs text-red-400 text-center">{error}</p>}
      </div>
    );
  }

  if (step === "pick-playlist") {
    return (
      <div className="flex flex-col gap-3 w-full">
        {profile && (
          <UserProfileCard profile={profile} onLogout={handleLogout} />
        )}

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

  // step === "configure"
  return (
    <div className="flex flex-col gap-4 w-full">
      {profile && (
        <UserProfileCard profile={profile} onLogout={handleLogout} />
      )}

      {selectedPlaylist && (
        <div className="flex items-center gap-3 rounded-[12px] px-4 py-3 bg-[oklch(0.88_0.005_272)] text-gray-800 dark:bg-[oklch(0.2403_0.0137_272.76)] dark:text-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={selectedPlaylist.image_url ?? "/playlist-placeholder.png"}
            alt=""
            className="w-10 h-10 rounded-[8px] object-cover"
          />
          <div>
            <p className="text-sm font-semibold">{selectedPlaylist.name}</p>
            <p className="text-xs opacity-50">Spotify playlist</p>
          </div>
          <button
            onClick={() => setStep("pick-playlist")}
            className="ml-auto text-xs opacity-50 hover:opacity-80 transition-opacity"
          >
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
          type="range"
          min={1}
          max={20}
          value={rounds}
          onChange={(e) => setRounds(Number(e.target.value))}
          className="accent-green-500"
        />
        <div className="flex justify-between text-xs opacity-30">
          <span>1</span>
          <span>20</span>
        </div>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <button className="play-button mx-auto mt-2" onClick={handleCreate}>
        Create room!
      </button>
    </div>
  );
}