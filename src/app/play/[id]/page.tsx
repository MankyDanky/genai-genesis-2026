import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GamePlayer } from "@/components/game-player";
import { getPublishedGame } from "@/lib/db/projects";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ room?: string }>;
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

export default async function PlayPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const query = await searchParams;

  const game = await getPublishedGame(id);

  if (!game) {
    notFound();
  }

  const roomId = typeof query.room === "string" && query.room.trim().length > 0
    ? query.room.trim()
    : game.multiplayer
      ? `game-${game.id}`
      : null;

  return (
    <GamePlayer
      code={game.code}
      title={game.title}
      gameId={game.id}
      multiplayer={game.multiplayer}
      multiplayerProvider={game.multiplayerProvider}
      multiplayerRoomType={game.multiplayerRoomType}
      runtimeEnv={game.runtimeEnv ?? {}}
      roomId={roomId}
    />
  );
}
