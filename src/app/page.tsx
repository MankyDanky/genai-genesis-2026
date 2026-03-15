"use client";

import { useState, useEffect, useLayoutEffect } from "react";
import dynamic from "next/dynamic";
import { GameForgeProvider } from "@/lib/game-forge-context";
import { ToastProvider } from "@/components/toast";

const DockLayout = dynamic(
  () => import("@/components/dock-layout").then((m) => ({ default: m.DockLayout })),
  { ssr: false }
);

const SplashScreen = dynamic(
  () => import("@/components/splash-screen").then((m) => ({ default: m.SplashScreen })),
  { ssr: false }
);

const LoginGate = dynamic(
  () => import("@/components/login-gate").then((m) => ({ default: m.LoginGate })),
  { ssr: false }
);

type View = "splash" | "login" | "editor";

const IS_PRODUCTION = process.env.NODE_ENV === "production";

export default function Home() {
  const [view, setView] = useState<View>("splash");

  useLayoutEffect(() => {
    if (!IS_PRODUCTION) {
      const splashSeen = localStorage.getItem("axiom-splash-seen");
      if (splashSeen) setView("editor");
      return;
    }
    if (sessionStorage.getItem("axiom-authed") && localStorage.getItem("axiom-splash-seen")) {
      setView("editor");
    }
  }, []);

  // Restore session from cookie if sessionStorage was cleared (e.g. tab closed)
  useEffect(() => {
    if (!IS_PRODUCTION || sessionStorage.getItem("axiom-authed")) return;
    if (!localStorage.getItem("axiom-splash-seen")) return;
    fetch("/api/auth").then((res) => {
      if (res.ok) {
        sessionStorage.setItem("axiom-authed", "1");
        setView("editor");
      }
    }).catch(() => {});
  }, []);

  const handleStartBuilding = () => {
    if (!IS_PRODUCTION || sessionStorage.getItem("axiom-authed")) {
      localStorage.setItem("axiom-splash-seen", "1");
      setView("editor");
    } else {
      setView("login");
    }
  };

  const handleAuthenticated = () => {
    localStorage.setItem("axiom-splash-seen", "1");
    setView("editor");
  };

  return (
    <GameForgeProvider>
      <ToastProvider>
        <div
          style={{
            opacity: view === "editor" ? 1 : 0,
            transition: "opacity 0.5s ease",
            width: "100%",
            height: "100%",
          }}
        >
          <DockLayout onShowSplash={() => setView("splash")} />
        </div>
        {view === "splash" && (
          <SplashScreen onDismiss={handleStartBuilding} />
        )}
        {view === "login" && (
          <LoginGate
            onAuthenticated={handleAuthenticated}
            onBack={() => setView("splash")}
          />
        )}
      </ToastProvider>
    </GameForgeProvider>
  );
}
