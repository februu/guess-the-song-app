"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ThemeToggle } from "../theme-toggle";

import {
  redirectToSpotifyLogin,
  spotifyLogout,
  tryLoadSpotifySession,
  type SpotifyPlaylist,
  type SpotifyProfile,
} from "@/lib/spotify";

import { UserProfileCard } from "../multiplayer/_components/UserProfileCard";
import { PlaylistRow } from "../multiplayer/_components/PlaylistRow";

// Module-level flags — survive React Strict Mode remounts
let userLoggedOut = false;
let sessionLoadStarted = false;

const isValidName = (v: string) => /^[a-zA-Z0-9_]{3,20}$/.test(v);

type Step = "connect" | "pick-playlist" | "configure";

export default function SingleplayerPage() {
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

  // ── On mount ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (sessionLoadStarted) return;
    sessionLoadStarted = true;

    const params = new URLSearchParams(window.location.search);
    const isPostLogin = params.get("spotify") === "connected";

    if (isPostLogin) {
      userLoggedOut = false;
      window.history.replaceState({}, "", "/singleplayer");
      loadSession(false);
    } else {
      loadSession(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Session loader ────────────────────────────────────────────────────────
  async function loadSession(silent: boolean) {
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

  // ── Logout ────────────────────────────────────────────────────────────────
  async function handleLogout() {
    userLoggedOut = true;
    sessionLoadStarted = false;
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

  // ── Playlist selected ─────────────────────────────────────────────────────
  function handlePlaylistSelect(playlist: SpotifyPlaylist) {
    setSelectedPlaylist(playlist);
    setStep("configure");
  }

  // ── Start game ────────────────────────────────────────────────────────────
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
    console.log("Starting singleplayer:", { nickname, playlist_id: selectedPlaylist.id, rounds });
    router.push("/game?mode=singleplayer");
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen flex flex-col bg-background text-foreground overflow-hidden">
      <div className="flex-1 flex items-center justify-center px-6 py-6">
        <div className="relative w-full max-w-[1200px] h-[650px] rounded-[28px] bg-[oklch(0.9821_0_0)] text-black dark:bg-[oklch(0.2178_0_0)] dark:text-white overflow-visible">

          {/* Top-left nav */}
          <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
            <div className="bg-black/10 dark:bg-black/30 backdrop-blur-md rounded-full p-2">
              <ThemeToggle />
            </div>
            <button
              onClick={() => router.push("/")}
              className="bg-black/10 dark:bg-black/30 backdrop-blur-md rounded-full px-3 h-9 flex items-center justify-center text-xs font-semibold opacity-70 hover:opacity-100 transition-opacity"
            >
              🏠 Home
            </button>
            {step !== "connect" && (
              <button
                onClick={() => setStep(step === "configure" ? "pick-playlist" : "connect")}
                className="bg-black/10 dark:bg-black/30 backdrop-blur-md rounded-full p-2 w-9 h-9 flex items-center justify-center text-sm font-semibold opacity-70 hover:opacity-100 transition-opacity"
              >
                ←
              </button>
            )}
          </div>

          {/* Main content */}
          <div className="h-full flex flex-col items-center px-10 pt-11 pb-8">
            <h1 className="text-6xl font-bold tracking-wide leading-none">MUZZLY</h1>
            <p className="mt-4 text-sm opacity-50">
              {step === "connect"      && "Solo mode — just you and the music"}
              {step === "pick-playlist" && "Pick a playlist to play"}
              {step === "configure"    && "Configure your game"}
            </p>

            <div className="flex-1 flex items-center justify-center w-full max-w-[500px]">

              {/* ── Step: connect ── */}
              {step === "connect" && (
                <div className="flex flex-col items-center gap-6 w-full">
                  <p className="text-base font-medium text-center">
                    Connect your Spotify account to load your playlists
                  </p>

                  <button
                    onClick={() => redirectToSpotifyLogin("/singleplayer")}
                    className="flex items-center gap-2 rounded-xl px-8 py-2 font-semibold text-white text-sm"
                    style={{ background: "#1DB954" }}
                  >
                    Connect Spotify
                  </button>

                  {loading && <p className="text-xs opacity-50">Loading Spotify…</p>}
                  {error && <p className="text-xs text-red-400 text-center">{error}</p>}
                </div>
              )}

              {/* ── Step: pick-playlist ── */}
              {step === "pick-playlist" && (
                <div className="flex flex-col gap-3 w-full">
                  {profile && (
                    <UserProfileCard profile={profile} onLogout={handleLogout} />
                  )}

                  <p className="text-sm opacity-60">Select a playlist to start</p>

                  <div className="rounded-[16px] overflow-y-auto max-h-[360px] bg-[oklch(0.88_0.005_272)] dark:bg-[oklch(0.2403_0.0137_272.76)]">
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
              )}

              {/* ── Step: configure ── */}
              {step === "configure" && (
                <div className="flex flex-col gap-4 w-full">
                  {profile && (
                    <UserProfileCard profile={profile} onLogout={handleLogout} />
                  )}

                  {/* Selected playlist summary */}
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

                  {/* Rounds slider */}
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

                  <button className="play-button mx-auto mt-2" onClick={handleStart}>
                    Start game!
                  </button>
                </div>
              )}

            </div>
          </div>

          {/* Side panel */}
          <div className="absolute top-1/2 right-0 -translate-y-1/2 translate-x-1/2 hidden xl:block">
            <div className="w-[200px] rounded-[20px] px-5 py-6 shadow-xl flex flex-col items-center gap-4 bg-[oklch(0.93_0.005_272)] text-gray-800 dark:bg-[oklch(0.2403_0.0137_272.76)] dark:text-white">
              <Image
                src="/cat.gif"
                alt="Singleplayer cat"
                width={100}
                height={100}
                className="w-[100px] h-auto opacity-90"
              />
              <p className="text-xs opacity-50 text-center leading-relaxed">
                Solo mode.<br />Beat your own score!
              </p>
            </div>
          </div>

        </div>
      </div>
      <div className="text-center text-xs opacity-50 pb-4">© 2026 Muzzly</div>
    </main>
  );
}