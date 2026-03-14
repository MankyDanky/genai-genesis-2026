"use client";

import dynamic from "next/dynamic";
import { GameForgeProvider } from "@/lib/game-forge-context";

const DockLayout = dynamic(
  () => import("@/components/dock-layout").then((m) => ({ default: m.DockLayout })),
  { ssr: false }
);

export default function Home() {
  return (
    <GameForgeProvider>
      <DockLayout />
    </GameForgeProvider>
  );
}
