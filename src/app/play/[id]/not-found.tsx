import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center h-screen w-screen bg-[var(--color-bg)] text-center px-4">
      <div className="space-y-4">
        <p className="text-[13px] text-[var(--color-text-muted)] uppercase tracking-[0.15em] font-bold">
          Game Not Found
        </p>
        <p className="text-[11px] text-[var(--color-text-muted)] opacity-60">
          This game may have expired or the link is invalid.
        </p>
        <Link
          href="/"
          className="inline-block mt-4 text-[11px] text-[var(--color-accent)] uppercase tracking-[0.1em] font-semibold hover:underline"
        >
          Create a game
        </Link>
      </div>
    </div>
  );
}
