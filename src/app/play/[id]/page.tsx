import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ObjectId } from "mongodb";
import { db } from "@/lib/db/client";
import type { GameDocument } from "@/lib/db/schema";
import { GamePlayer } from "@/components/game-player";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;

  if (!ObjectId.isValid(id)) {
    return { title: "Game Not Found | GAME FORGE" };
  }

  const game = await db
    .collection<GameDocument>("games")
    .findOne({ _id: new ObjectId(id) }, { projection: { title: 1 } });

  if (!game) {
    return { title: "Game Not Found | GAME FORGE" };
  }

  return {
    title: `${game.title} | GAME FORGE`,
    description: `Play ${game.title} — built with Game Forge`,
  };
}

export default async function PlayPage({ params }: PageProps) {
  const { id } = await params;

  if (!ObjectId.isValid(id)) {
    notFound();
  }

  const game = await db
    .collection<GameDocument>("games")
    .findOne({ _id: new ObjectId(id) });

  if (!game) {
    notFound();
  }

  return (
    <GamePlayer
      code={game.code}
      title={game.title}
      gameId={game._id.toHexString()}
    />
  );
}
