"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";

interface LoginGateProps {
  onAuthenticated: () => void;
  onBack: () => void;
}

export function LoginGate({ onAuthenticated, onBack }: LoginGateProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (res.ok) {
        sessionStorage.setItem("axiom-authed", "1");
        onAuthenticated();
      } else {
        const data = await res.json();
        setError(data.error || "Authentication failed");
      }
    } catch {
      setError("Connection failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[var(--color-bg)]">
      {/* Grid background */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `
            repeating-linear-gradient(0deg, var(--color-border) 0px, transparent 1px, transparent 40px),
            repeating-linear-gradient(90deg, var(--color-border) 0px, transparent 1px, transparent 40px)
          `,
          opacity: 0.4,
        }}
      />

      {/* Radial glow */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at center, var(--color-accent-glow-strong) 0%, transparent 60%)",
          animation: "splashGridPulse 4s ease-in-out infinite",
        }}
      />

      {/* Login form */}
      <div className="relative flex flex-col items-center gap-6 animate-[fadeIn_0.6s_ease-out]">
        <Image src="/axiom.png" alt="AXIOM" width={48} height={48} priority />

        <div className="flex flex-col items-center gap-1">
          <h1 className="text-[18px] font-bold text-[var(--color-text)] tracking-[0.3em] uppercase">
            AXIOM
          </h1>
          <p className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-[0.15em]">
            Authentication Required
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col items-center gap-3 w-[260px]"
        >
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            className="w-full px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-border-light)] text-[var(--color-text)] text-[11px] tracking-[0.05em] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)]"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-border-light)] text-[var(--color-text)] text-[11px] tracking-[0.05em] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)]"
          />

          {error && (
            <p className="text-[10px] text-red-400 uppercase tracking-[0.1em]">
              {error}
            </p>
          )}

          <div className="flex items-center gap-3 mt-1 w-full">
            <button
              type="button"
              onClick={onBack}
              className="flex-1 gf-btn-chip px-4 py-2 border border-[var(--color-border-light)] bg-transparent text-[var(--color-text-secondary)] text-[10px] font-bold uppercase tracking-[0.15em] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-colors cursor-pointer"
            >
              Back
            </button>
            <button
              type="submit"
              disabled={loading || !username || !password}
              className="flex-1 gf-btn-primary px-4 py-2 bg-[var(--color-accent)] text-[var(--color-bg)] text-[10px] font-bold uppercase tracking-[0.15em] border-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? "..." : "Enter"}
            </button>
          </div>
        </form>

        <p className="text-[10px] text-[var(--color-text-muted)] mt-2">
          Just browsing?{" "}
          <Link
            href="/explore"
            className="text-[var(--color-accent)] hover:underline"
          >
            Explore community creations
          </Link>
        </p>
      </div>
    </div>
  );
}
