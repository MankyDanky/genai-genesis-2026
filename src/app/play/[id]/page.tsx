import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GamePlayer } from "@/components/game-player";
import { getPublishedGame } from "@/lib/db/projects";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;

  const game = await getPublishedGame(id);
  if (!game) {
    return { title: "Game Not Found | AXIOM" };
  }

  return {
    title: `${game.title} | AXIOM`,
    description: `Play ${game.title} — built with AXIOM`,
  };
}

export default async function PlayPage({ params }: PageProps) {
  const { id } = await params;

  const game = await getPublishedGame(id);

  if (!game) {
    notFound();
  }

  return <GamePlayer code={game.code} title={game.title} gameId={game.id} />;
}
