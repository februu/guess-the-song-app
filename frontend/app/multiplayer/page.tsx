"use client";

import { Suspense } from "react";
import { MultiplayerShell } from "./_components/MultiplayerShell";

export default function MultiplayerPage() {
  return (
    <Suspense>
      <MultiplayerShell />
    </Suspense>
  );
}