import Image from "next/image";
import Link from "next/link";
import { listPublishedGames } from "@/lib/db/projects";
import { ExploreGrid, type ExploreGameItem } from "@/components/explore-grid";

export default async function ExplorePage() {
  const games = await listPublishedGames(120);
  const viewGames: ExploreGameItem[] = games.map((game) => ({
    id: game.id,
    title: game.title,
    engine: game.engine,
    multiplayer: game.multiplayer ?? false,
    multiplayerRoomType: game.multiplayerRoomType ?? null,
    thumbnail: game.thumbnail ?? null,
    createdAt: game.createdAt.toISOString(),
  }));

  return (
    <main className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]">
      <div className="mx-auto w-full max-w-6xl px-5 py-8">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Image src="/axiom.png" alt="Axiom" width={28} height={28} className="object-contain" />
            <div>
              <h1 className="text-[14px] uppercase tracking-[0.14em] text-[var(--color-accent)] font-bold">
                Explore
              </h1>
              <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
                Community creations published from Axiom
              </p>
            </div>
          </div>
          <Link
            href="/?new=1"
            className="gf-btn-chip border border-[var(--color-border-light)] bg-[var(--color-surface)] px-3 py-1.5 text-[10px] uppercase tracking-[0.1em] text-[var(--color-text-secondary)]"
          >
            Create Your Own
          </Link>
        </div>

        {viewGames.length === 0 ? (
          <div className="border border-[var(--color-border-light)] bg-[var(--color-surface)] px-4 py-6 text-center">
            <p className="text-[11px] uppercase tracking-[0.1em] text-[var(--color-text-muted)]">
              No creations yet
            </p>
          </div>
        ) : (
          <ExploreGrid games={viewGames} />
        )}
      </div>
    </main>
  );
}
