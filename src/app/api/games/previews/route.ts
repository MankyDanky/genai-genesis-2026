import { NextResponse } from "next/server";
import { getPublishedGame } from "@/lib/db/projects";

const MAX_BATCH = 12;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { ids?: string[] };
    const ids = Array.isArray(body.ids) ? body.ids.slice(0, MAX_BATCH) : [];

    if (ids.length === 0) {
      return NextResponse.json({ previews: [] });
    }

    const results = await Promise.allSettled(
      ids.map((id) => getPublishedGame(id)),
    );

    const previews = results.map((result, i) => {
      if (result.status === "fulfilled" && result.value) {
        return {
          id: ids[i],
          title: result.value.title,
          engine: result.value.engine,
          code: result.value.code,
        };
      }
      return { id: ids[i], title: null, engine: null, code: null };
    });

    return NextResponse.json(
      { previews },
      {
        headers: {
          "Cache-Control":
            "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
        },
      },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to load previews",
      },
      { status: 500 },
    );
  }
}
