import { listPublishedGames } from "@/lib/db/projects";
import { BackfillRunner } from "./backfill-runner";

interface BackfillGame {
  id: string;
  title: string;
  hasThumbnail: boolean;
}

export default async function BackfillThumbnailsPage() {
  const games = await listPublishedGames(200);
  const items: BackfillGame[] = games.map((g) => ({
    id: g.id,
    title: g.title,
    hasThumbnail: !!g.thumbnail,
  }));

  const missing = items.filter((g) => !g.hasThumbnail).length;

  return (
    <main className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]">
      <div className="mx-auto w-full max-w-3xl px-5 py-8">
        <h1 className="text-[14px] uppercase tracking-[0.14em] text-[var(--color-accent)] font-bold mb-1">
          Backfill Thumbnails
        </h1>
        <p className="text-[11px] text-[var(--color-text-muted)] mb-5">
          {items.length} games total, {missing} missing thumbnails
        </p>
        <BackfillRunner games={items} />
      </div>
    </main>
  );
}
