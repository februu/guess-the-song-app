"use client";

import { Suspense } from "react";
import { MultiplayerShell } from "./_components/MultiplayerShell";

// This is the main page component for the multiplayer mode. 
// It renders the MultiplayerShell component inside a Suspense boundary, 
// which allows for lazy loading of the multiplayer UI and its data dependencies. 
export default function MultiplayerPage() {
  return (
    <Suspense>
      <MultiplayerShell />
    </Suspense>
  );
}