"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ThemeToggle } from "../theme-toggle";



type View = "choose" | "create" | "join";

interface Playlist {
  id: string;
  name: string;
  image: string;
  tracks: number;
}

// Mock Spotify playlists 
const MOCK_PLAYLISTS: Playlist[] = [
  { id: "1", name: "Best hits",    image: "https://mosaic.scdn.co/640/ab67616d00001e02212d776c31027c511f0ee3bcab67616d00001e026c20c4638a558132ba95bc39ab67616d00001e02e14f11f796cef9f9a82691a7ab67616d00001e02f46b9d202509a8f7384b90de", tracks: 20 },
  { id: "2", name: "Chill mood",   image: "https://mosaic.scdn.co/640/ab67616d00001e02212d776c31027c511f0ee3bcab67616d00001e026c20c4638a558132ba95bc39ab67616d00001e02e14f11f796cef9f9a82691a7ab67616d00001e02f46b9d202509a8f7384b90de", tracks: 20 },
  { id: "3", name: "Skibidi Ohio", image: "https://mosaic.scdn.co/640/ab67616d00001e02212d776c31027c511f0ee3bcab67616d00001e026c20c4638a558132ba95bc39ab67616d00001e02e14f11f796cef9f9a82691a7ab67616d₀₀₀₀₁e₀₂f₄₆b₉d₂₀₂₅₀₉a₈f₇₃₈₄b₉₀de", tracks: 20 },
];

// Validation helpers

/** Name: 3–20 chars, letters/numbers/underscores */
const isValidName = (v: string) => /^[a-zA-Z0-9_]{3,20}$/.test(v);

/** Room code: exactly 6 letters */
const isValidCode = (v: string) => /^[a-zA-Z]{6}$/.test(v);

//  Page

export default function MultiplayerPage() {
  const [view, setView] = useState<View>("choose");
  const router = useRouter();
  return (
    <main className="min-h-screen flex flex-col bg-background text-foreground overflow-hidden">
      <div className="flex-1 flex items-center justify-center px-6 py-6">

        {/* Main container */}
        <div className="
          relative w-full max-w-[1200px] h-[650px]
          rounded-[28px]
          bg-[oklch(0.9821_0_0)] text-black
          dark:bg-[oklch(0.2178_0_0)] dark:text-white
          overflow-visible
        ">
          <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
            <div className="bg-black/10 dark:bg-black/30 backdrop-blur-md rounded-full p-2">
              <ThemeToggle />
            </div>
            {/* Back to home page */}
            <button
              onClick={() => router.push("/")}
              className="bg-black/10 dark:bg-black/30 backdrop-blur-md rounded-full px-3 h-9 flex items-center justify-center text-xs font-semibold opacity-70 hover:opacity-100 transition-opacity"
            >
              🏠 Home
            </button>

            {/* Back to choose view - only shown when inside create or join */}
            {view !== "choose" && (
              <button
                onClick={() => setView("choose")}
                className="bg-black/10 dark:bg-black/30 backdrop-blur-md rounded-full p-2 w-9 h-9 flex items-center justify-center text-sm font-semibold opacity-70 hover:opacity-100 transition-opacity"
              >
                ←
              </button>
            )}
          </div>

          {/* Inner content - title pinned near top, content centered below */}
          <div className="h-full flex flex-col items-center px-10 pt-11 pb-30">

            {/* App title - near top */}
            <h1 className="text-6xl font-bold tracking-wide leading-none">
              MUZZLY 
            </h1>
            <p className="mt-4 text-sm opacity-50">Guess songs with your friends!</p>

            {/* View content - centered in remaining space */}
            <div className="flex-1 flex items-center justify-center w-full max-w-[500px]">
              {view === "choose" && <ChooseView onChoose={setView} />}
              {view === "create" && <CreateView />}
              {view === "join"   && <JoinView />}
            </div>
          </div>

          {/* Side info panel - same as homepage, floats outside on xl screens */}
          <div className="absolute top-1/2 right-0 -translate-y-1/2 translate-x-1/2 hidden xl:block">
            <SidePanel />
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center text-xs opacity-50 pb-4">© 2026 Muzzly</div>
    </main>
  );
}

// Side panel 

function SidePanel() {
  return (
    <div className="
      w-[200px] rounded-[20px] px-5 py-6 shadow-xl
      flex flex-col items-center gap-4
      bg-[oklch(0.93_0.005_272)] text-gray-800
      dark:bg-[oklch(0.2403_0.0137_272.76)] dark:text-white
    ">

      {/* Multiplayer illustration */}
      <Image
        src="/cat.gif"
        alt="Multiplayer"
        width={100}
        height={100}
        className="w-[100px] h-auto opacity-90"
      />
    </div>
  );
}

// View: Choose mode 
function ChooseView({ onChoose }: { onChoose: (v: View) => void }) {
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

// View: Create room (admin )

function CreateView() {
  const [step, setStep]                 = useState<"spotify" | "setup">("spotify");
  const [spotifyConnected, setSpotify]  = useState(false);
  const [playlists]                     = useState<Playlist[]>(MOCK_PLAYLISTS);
  const [selectedPlaylist, setSelected] = useState<Playlist | null>(null);
  const [nickname, setNickname]         = useState("");
  const [rounds, setRounds]             = useState(10);
  const [nameError, setNameError]       = useState("");

  // Simulate Spotify OAuth - in future replace with real OAuth flow
  const handleSpotifyLogin = () => setSpotify(true);

  // Proceed to setup after playlist is chosen
  const handleSelectPlaylist = (p: Playlist) => {
    setSelected(p);
    setStep("setup");
  };

  // Send room.create WebSocket message
  const handleCreate = () => {
    if (!isValidName(nickname)) {
      setNameError("3–20 chars, letters, numbers or underscores only");
      return;
    }
    if (!selectedPlaylist) return;

    const msg = {
      type: "room.create",
      data: { name: nickname, playlist_id: selectedPlaylist.id, rounds },
    };
    console.log("WS send:", JSON.stringify(msg));
    // TODO: ws.send(JSON.stringify(msg));
  };

  return (
    <div className="flex flex-col gap-4 text-left w-full">

      {step === "spotify" && (
        <>
          {!spotifyConnected ? (
            // Spotify login prompt
            <div className="flex flex-col items-center gap-10">
              <p className="text-l font-mediumtext-center">
                Connect your Spotify account to load your playlists
              </p>
              <button
                onClick={handleSpotifyLogin}
                className="flex items-center gap-2 rounded-xl px-8 py-2 font-semibold text-white text-sm"
                style={{ background: "#1DB954" }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                  <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
                </svg>
                Connect Spotify
              </button>
            </div>
          ) : (
            // Playlist selector
            <div className="flex flex-col gap-2">
              <p className="text-sm opacity-60">Select a playlist</p>
              <div className="
                rounded-[16px] overflow-y-auto max-h-[260px]
                bg-[oklch(0.88_0.005_272)] dark:bg-[oklch(0.2403_0.0137_272.76)]
              ">
                {playlists.map((p) => (
                  <PlaylistRow
                    key={p.id}
                    playlist={p}
                    selected={selectedPlaylist?.id === p.id}
                    onClick={() => handleSelectPlaylist(p)}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {step === "setup" && selectedPlaylist && (
        <div className="flex flex-col gap-4">

          {/* Selected playlist summary */}
          <div className="flex items-center gap-3 rounded-[12px] px-4 py-3
            bg-[oklch(0.88_0.005_272)] text-gray-800
            dark:bg-[oklch(0.2403_0.0137_272.76)] dark:text-white
          ">
            <img src={selectedPlaylist.image} alt="" className="w-10 h-10 rounded-[8px] object-cover" />
            <div>
              <p className="text-sm font-semibold">{selectedPlaylist.name}</p>
              <p className="text-xs opacity-50">{selectedPlaylist.tracks} songs</p>
            </div>
            <button onClick={() => setStep("spotify")} className="ml-auto text-xs opacity-50 hover:opacity-80">
              Change
            </button>
          </div>

          {/* Nickname input */}
          <div className="flex flex-col gap-1">
            <label className="text-xs opacity-50">Your nickname</label>
            <input
              type="text"
              value={nickname}
              onChange={(e) => { setNickname(e.target.value); setNameError(""); }}
              placeholder="e.g. awesomeDJ99"
              className="
                rounded-[12px] px-4 py-2 text-sm outline-none
                bg-[oklch(0.88_0.005_272)] text-gray-800 placeholder:opacity-30
                dark:bg-[oklch(0.2403_0.0137_272.76)] dark:text-white
                border border-transparent focus:border-white/20
              "
            />
            {nameError && <p className="text-xs text-red-400">{nameError}</p>}
          </div>

          {/* Rounds picker */}
          <div className="flex flex-col gap-1">
            <label className="text-xs opacity-50">Rounds: {rounds}</label>
            <input
              type="range" min={1} max={20} value={rounds}
              onChange={(e) => setRounds(Number(e.target.value))}
              className="accent-green-500"
            />
            <div className="flex justify-between text-xs opacity-30">
              <span>1</span><span>20</span>
            </div>
          </div>

          <button className="play-button mx-auto mt-2" onClick={handleCreate}>
            Create room!
          </button>
        </div>
      )}
    </div>
  );
}

//  View: Join room 

function JoinView() {
  const [nickname, setNickname]   = useState("");
  const [code, setCode]           = useState("");
  const [nameError, setNameError] = useState("");
  const [codeError, setCodeError] = useState("");

  // Send room.join WebSocket message
  const handleJoin = () => {
    let valid = true;
    if (!isValidName(nickname)) { setNameError("3–20 chars, letters, numbers or underscores only"); valid = false; }
    if (!isValidCode(code))     { setCodeError("Code must be exactly 6 letters"); valid = false; }
    if (!valid) return;

    const msg = {
      type: "room.join",
      data: { name: nickname, code: code.toLowerCase() },
    };
    console.log("WS send:", JSON.stringify(msg));
    // TODO: ws.send(JSON.stringify(msg));
  };

  return (
    <div className="flex flex-col gap-4 text-left w-full">

      {/* Nickname input */}
      <div className="flex flex-col gap-1">
        <label className="text-xs opacity-50">Your nickname</label>
        <input
          type="text"
          value={nickname}
          onChange={(e) => { setNickname(e.target.value); setNameError(""); }}
          placeholder="e.g. awesomeDJ99"
          className="
            rounded-[12px] px-4 py-2 text-sm outline-none
            bg-[oklch(0.88_0.005_272)] text-gray-800 placeholder:opacity-30
            dark:bg-[oklch(0.2403_0.0137_272.76)] dark:text-white
            border border-transparent focus:border-white/20
          "
        />
        {nameError && <p className="text-xs text-red-400">{nameError}</p>}
      </div>

      {/* Room code input */}
      <div className="flex flex-col gap-1">
        <label className="text-xs opacity-50">Room code</label>
        <input
          type="text"
          value={code}
          onChange={(e) => { setCode(e.target.value.toUpperCase()); setCodeError(""); }}
          placeholder="ABCDEF"
          maxLength={6}
          className="
            rounded-[12px] px-4 py-2 text-sm outline-none tracking-widest font-semibold
            bg-[oklch(0.88_0.005_272)] text-gray-800 placeholder:opacity-30
            dark:bg-[oklch(0.2403_0.0137_272.76)] dark:text-white
            border border-transparent focus:border-white/20
          "
        />
        {codeError && <p className="text-xs text-red-400">{codeError}</p>}
      </div>

      <button className="play-button mx-auto mt-2" onClick={handleJoin}>
        Join room!
      </button>
    </div>
  );
}

// Reusable playlist row 

function PlaylistRow({ playlist, selected, onClick }: { playlist: Playlist; selected: boolean; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors text-white ${selected ? "bg-white/10" : "hover:bg-white/5"}`}
    >
      <img src={playlist.image} alt="" className="w-10 h-10 rounded-[8px] object-cover bg-white/10" />
      <div className="text-left">
        <p className="text-sm font-semibold">{playlist.name}</p>
        <p className="text-xs opacity-50">{playlist.tracks} songs</p>
      </div>
    </div>
  );
}