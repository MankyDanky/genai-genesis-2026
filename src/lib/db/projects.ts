import { randomUUID } from "crypto";
import { ObjectId } from "mongodb";
import { ensureDbSetup, getDb, logOptionalDbFailure } from "@/lib/db/client";
import {
  createTextArtifactRef,
  INLINE_JSON_BYTES_LIMIT,
  INLINE_TEXT_BYTES_LIMIT,
  readArtifactBuffer,
  resolveTextArtifact,
} from "@/lib/db/artifacts";
import { getImage } from "@/lib/image-store";
import {
  PROJECT_SCHEMA_VERSION,
  type PersistedChatMessage,
  type ProjectDocument,
  type ProjectRevisionDocument,
  type PublishedGameDocument,
  type SaveProjectSnapshotRequest,
} from "@/lib/db/schema";
import { compileProjectToHtml } from "@/lib/project-files";
import type { AudioTrack } from "@/lib/game-forge-context";

interface FallbackPublishedGame {
  id: string;
  title: string;
  engine: "canvas2d" | "threejs";
  code: string;
  multiplayer: boolean;
  multiplayerProvider: "partykit" | null;
  multiplayerRoomType: string | null;
  runtimeEnv: Record<string, string>;
  createdAt: Date;
}

declare global {
  var __fallbackPublishedGames: Map<string, FallbackPublishedGame> | undefined;
}

function getFallbackPublishedGamesStore() {
  if (!globalThis.__fallbackPublishedGames) {
    globalThis.__fallbackPublishedGames = new Map<string, FallbackPublishedGame>();
  }
  return globalThis.__fallbackPublishedGames;
}

function fallbackGameId(gameId: string | ObjectId) {
  return typeof gameId === "string" ? gameId : gameId.toHexString();
}

function deriveTitle(snapshot: SaveProjectSnapshotRequest) {
  const fromRequest = snapshot.title?.trim();
  if (fromRequest) return fromRequest;
  const html = snapshot.currentCode ?? snapshot.projectFiles.find((file) => file.path === "index.html")?.content ?? "";
  const titleMatch = html.match(/<title>(.*?)<\/title>/i);
  return titleMatch?.[1]?.trim() || "Untitled Game";
}

function detectPublishedGameMultiplayer(html: string) {
  const lower = html.toLowerCase();
  const multiplayerHints = [
    "createpartysession(",
    "__partykit_host__",
    "__partykit_room_id__",
    "/parties/",
    "partykit",
  ];
  const multiplayer = multiplayerHints.some((hint) => lower.includes(hint));

  if (!multiplayer) {
    return {
      multiplayer: false,
      multiplayerProvider: null as const,
      multiplayerRoomType: null as string | null,
    };
  }

  const roomTypeMatch =
    html.match(/__GAMEFORGE_PARTYKIT_ROOM_TYPE__\s*=\s*["']([^"'\\\n]+)["']/i) ??
    html.match(/roomType\s*=\s*["']([^"'\\\n]+)["']/i) ??
    html.match(/\/parties\/([^/"'\\\n]+)\//i);
  const roomType = roomTypeMatch?.[1]?.trim() || "game";

  return {
    multiplayer: true,
    multiplayerProvider: "partykit" as const,
    multiplayerRoomType: roomType,
  };
}

function toObjectId(value: string | ObjectId) {
  return typeof value === "string" ? new ObjectId(value) : value;
}

const SOUND_BRIDGE_SCRIPT = `<script>
window.__GAMEFORGE_SOUNDS__ = window.__GAMEFORGE_SOUNDS__ || {};
window.__GAMEFORGE_MUSIC__ = window.__GAMEFORGE_MUSIC__ || {};
</script>`;

async function resolveAudioTrackDataUrl(track: AudioTrack): Promise<string | null> {
  if (!track.dataUrl) return null;
  // Already a data URL — use as-is
  if (track.dataUrl.startsWith("data:")) return track.dataUrl;
  // /api/sound-files/{artifactId} — resolve to inline data URL
  const match = track.dataUrl.match(/\/api\/sound-files\/([a-f0-9]+)$/);
  if (!match) return track.dataUrl;
  try {
    const artifact = await readArtifactBuffer(match[1]);
    if (!artifact) return null;
    const base64 = artifact.buffer.toString("base64");
    return `data:${artifact.doc.contentType};base64,${base64}`;
  } catch {
    return null;
  }
}

async function injectSoundsIntoHtml(
  html: string,
  tracks: AudioTrack[],
): Promise<string> {
  const readyTracks = tracks.filter((t) => t.status === "ready" && !!t.dataUrl);
  if (readyTracks.length === 0) return html;

  const soundMap: Record<string, string> = {};
  const musicMap: Record<string, string> = {};

  await Promise.all(
    readyTracks.map(async (track) => {
      const dataUrl = await resolveAudioTrackDataUrl(track);
      if (!dataUrl) return;
      if (track.type === "music") {
        musicMap[track.name] = dataUrl;
      } else {
        soundMap[track.name] = dataUrl;
      }
    }),
  );

  if (Object.keys(soundMap).length === 0 && Object.keys(musicMap).length === 0) {
    return html;
  }

  const initialScript = `<script>
window.__GAMEFORGE_SOUNDS__ = ${JSON.stringify(soundMap)};
window.__GAMEFORGE_MUSIC__ = ${JSON.stringify(musicMap)};
</script>`;

  const combined = `${SOUND_BRIDGE_SCRIPT}${initialScript}`;
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>${combined}`);
  }
  return `${combined}${html}`;
}

async function inlineImageUrls(html: string): Promise<string> {
  const imageUrlPattern = /(?:https?:\/\/[^/"'\s]+)?\/api\/images\/([a-f0-9-]+)/g;
  const matches = [...html.matchAll(imageUrlPattern)];
  if (matches.length === 0) return html;

  // Deduplicate artifact IDs
  const uniqueIds = [...new Set(matches.map((m) => m[1]))];
  const resolved = new Map<string, string>();

  await Promise.all(
    uniqueIds.map(async (artifactId) => {
      try {
        const image = await getImage(artifactId);
        if (!image) return;
        const base64 = image.data.toString("base64");
        resolved.set(artifactId, `data:${image.mimeType};base64,${base64}`);
      } catch {
        // skip unresolvable images
      }
    }),
  );

  if (resolved.size === 0) return html;

  return html.replace(imageUrlPattern, (fullMatch, id: string) => {
    return resolved.get(id) ?? fullMatch;
  });
}

async function buildRevisionArtifacts(
  snapshot: SaveProjectSnapshotRequest,
  projectId?: string | ObjectId | null,
  revisionId?: string | ObjectId | null,
) {
  const compiledHtmlValue = snapshot.currentCode ?? compileProjectToHtml(snapshot.projectFiles) ?? "";
  const compiledHtml = await createTextArtifactRef({
    kind: "compiled-html",
    text: compiledHtmlValue,
    contentType: "text/html;charset=utf-8",
    projectId,
    revisionId,
    inlineLimitBytes: INLINE_TEXT_BYTES_LIMIT,
  });

  const chatMessages = await createTextArtifactRef({
    kind: "chat-transcript",
    text: JSON.stringify(snapshot.chatMessages),
    contentType: "application/json",
    projectId,
    revisionId,
    inlineLimitBytes: INLINE_JSON_BYTES_LIMIT,
  });

  return { compiledHtml, chatMessages };
}

async function hydrateRevision(revision: ProjectRevisionDocument) {
  const [compiledHtml, rawChatMessages] = await Promise.all([
    resolveTextArtifact(revision.compiledHtml),
    resolveTextArtifact(revision.chatTranscript),
  ]);

  return {
    projectId: revision.projectId.toHexString(),
    revisionId: revision._id.toHexString(),
    revisionNumber: revision.revisionNumber,
    title: revision.title,
    engine: revision.engine,
    projectFiles: revision.projectFiles,
    controls: revision.controls,
    planningTodos: revision.planningTodos,
    generatedImages: revision.generatedImages,
    audioTracks: revision.audioTracks,
    runtimeEnv: revision.runtimeEnv ?? {},
    currentCode: compiledHtml,
    chatMessages: (JSON.parse(rawChatMessages || "[]") as PersistedChatMessage[]),
    createdAt: revision.createdAt,
  };
}

export async function createProjectFromSnapshot(snapshot: SaveProjectSnapshotRequest) {
  await ensureDbSetup();
  const db = getDb();

  const now = new Date();
  const title = deriveTitle(snapshot);

  const projectDoc: ProjectDocument = {
    _id: new ObjectId(),
    schemaVersion: PROJECT_SCHEMA_VERSION,
    title,
    engine: snapshot.engine,
    status: "draft",
    latestRevisionNumber: 0,
    latestRevisionId: null,
    latestPublishedRevisionId: null,
    createdAt: now,
    updatedAt: now,
  };

  await db.collection<ProjectDocument>("projects").insertOne(projectDoc);
  const revision = await createRevisionFromSnapshot(projectDoc._id, snapshot);

  return {
    projectId: projectDoc._id.toHexString(),
    revisionNumber: revision.revisionNumber,
    revisionId: revision.revisionId,
    title: revision.title,
    engine: revision.engine,
  };
}

export async function createRevisionFromSnapshot(
  projectId: string | ObjectId,
  snapshot: SaveProjectSnapshotRequest,
) {
  await ensureDbSetup();
  const db = getDb();

  const projects = db.collection<ProjectDocument>("projects");
  const projectObjectId = toObjectId(projectId);
  const project = await projects.findOne({ _id: projectObjectId });
  if (!project) {
    throw new Error("Project not found");
  }

  const now = new Date();
  const title = deriveTitle(snapshot);
  const revisionNumber = project.latestRevisionNumber + 1;
  const revisionId = new ObjectId();
  const { compiledHtml, chatMessages } = await buildRevisionArtifacts(
    snapshot,
    projectObjectId,
    revisionId,
  );

  const revisionDoc: ProjectRevisionDocument = {
    _id: revisionId,
    schemaVersion: PROJECT_SCHEMA_VERSION,
    projectId: projectObjectId,
    revisionNumber,
    title,
    engine: snapshot.engine,
    projectFiles: snapshot.projectFiles,
    controls: snapshot.controls,
    planningTodos: snapshot.planningTodos,
    generatedImages: snapshot.generatedImages,
    audioTracks: snapshot.audioTracks,
    runtimeEnv: snapshot.runtimeEnv,
    compiledHtml,
    chatTranscript: chatMessages,
    createdAt: now,
  };

  await db.collection<ProjectRevisionDocument>("project_revisions").insertOne(revisionDoc);
  await projects.updateOne(
    { _id: projectObjectId },
    {
      $set: {
        title,
        engine: snapshot.engine,
        latestRevisionNumber: revisionNumber,
        latestRevisionId: revisionId,
        updatedAt: now,
      },
    },
  );

  return {
    projectId: projectObjectId.toHexString(),
    revisionId: revisionId.toHexString(),
    revisionNumber,
    title,
    engine: snapshot.engine,
  };
}

export async function getProjectSummary(projectId: string | ObjectId) {
  await ensureDbSetup();
  const doc = await getDb()
    .collection<ProjectDocument>("projects")
    .findOne({ _id: toObjectId(projectId) });
  if (!doc) return null;

  return {
    projectId: doc._id.toHexString(),
    title: doc.title,
    engine: doc.engine,
    status: doc.status,
    latestRevisionNumber: doc.latestRevisionNumber,
    latestRevisionId: doc.latestRevisionId?.toHexString() ?? null,
    latestPublishedRevisionId: doc.latestPublishedRevisionId?.toHexString() ?? null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export async function getProjectRevision(
  projectId: string | ObjectId,
  revisionNumber: number,
) {
  await ensureDbSetup();
  const revision = await getDb().collection<ProjectRevisionDocument>("project_revisions").findOne({
    projectId: toObjectId(projectId),
    revisionNumber,
  });

  if (!revision) return null;
  return hydrateRevision(revision);
}

export async function getLatestProjectRevision(projectId: string | ObjectId) {
  await ensureDbSetup();
  const project = await getDb()
    .collection<ProjectDocument>("projects")
    .findOne({ _id: toObjectId(projectId) });
  if (!project || project.latestRevisionNumber <= 0) return null;
  return getProjectRevision(project._id, project.latestRevisionNumber);
}

export async function publishProjectRevision(
  projectId: string | ObjectId,
  revisionNumber?: number,
) {
  await ensureDbSetup();
  const db = getDb();
  const projects = db.collection<ProjectDocument>("projects");
  const revisions = db.collection<ProjectRevisionDocument>("project_revisions");
  const projectObjectId = toObjectId(projectId);
  const project = await projects.findOne({ _id: projectObjectId });
  if (!project) {
    throw new Error("Project not found");
  }

  const targetRevisionNumber = revisionNumber ?? project.latestRevisionNumber;
  if (!targetRevisionNumber) {
    throw new Error("Project has no revisions to publish");
  }

  const revision = await revisions.findOne({
    projectId: projectObjectId,
    revisionNumber: targetRevisionNumber,
  });
  if (!revision) {
    throw new Error("Revision not found");
  }

  // Resolve the base HTML and inline all assets (images + audio) as data URLs
  const baseHtml = await resolveTextArtifact(revision.compiledHtml);
  const htmlWithImages = await inlineImageUrls(baseHtml);
  const htmlWithAssets = await injectSoundsIntoHtml(htmlWithImages, revision.audioTracks ?? []);
  const multiplayerMeta = detectPublishedGameMultiplayer(htmlWithAssets);

  const publishedCompiledHtml = await createTextArtifactRef({
    kind: "compiled-html",
    text: htmlWithAssets,
    contentType: "text/html;charset=utf-8",
    projectId: projectObjectId,
    revisionId: revision._id,
    inlineLimitBytes: INLINE_TEXT_BYTES_LIMIT,
  });

  const publishedGameId = new ObjectId();
  const publishedDoc: PublishedGameDocument = {
    _id: publishedGameId,
    schemaVersion: PROJECT_SCHEMA_VERSION,
    projectId: projectObjectId,
    revisionId: revision._id,
    revisionNumber: revision.revisionNumber,
    title: revision.title,
    engine: revision.engine,
    multiplayer: multiplayerMeta.multiplayer,
    multiplayerProvider: multiplayerMeta.multiplayerProvider,
    multiplayerRoomType: multiplayerMeta.multiplayerRoomType,
    runtimeEnv: revision.runtimeEnv ?? {},
    compiledHtml: publishedCompiledHtml,
    createdAt: new Date(),
  };

  await db.collection<PublishedGameDocument>("published_games").insertOne(publishedDoc);
  await projects.updateOne(
    { _id: projectObjectId },
    {
      $set: {
        latestPublishedRevisionId: revision._id,
        updatedAt: new Date(),
      },
    },
  );

  return {
    publishId: publishedGameId.toHexString(),
    projectId: projectObjectId.toHexString(),
    revisionNumber: revision.revisionNumber,
    playPath: `/play/${publishedGameId.toHexString()}`,
  };
}

export async function getPublishedGame(gameId: string | ObjectId) {
  try {
    await ensureDbSetup();
    const doc = await getDb()
      .collection<PublishedGameDocument>("published_games")
      .findOne({ _id: toObjectId(gameId) });
    if (doc) {
      return {
        id: doc._id.toHexString(),
        projectId: doc.projectId?.toHexString() ?? null,
        revisionId: doc.revisionId?.toHexString() ?? null,
        revisionNumber: doc.revisionNumber,
        title: doc.title,
        engine: doc.engine,
        code: await resolveTextArtifact(doc.compiledHtml),
        multiplayer: doc.multiplayer ?? false,
        multiplayerProvider: doc.multiplayerProvider ?? null,
        multiplayerRoomType: doc.multiplayerRoomType ?? null,
        runtimeEnv: doc.runtimeEnv ?? {},
        createdAt: doc.createdAt,
      };
    }
  } catch (error) {
    logOptionalDbFailure("Published games", error);
  }

  const fallback = getFallbackPublishedGamesStore().get(fallbackGameId(gameId));
  if (!fallback) return null;
  return {
    id: fallback.id,
    projectId: null,
    revisionId: null,
    revisionNumber: null,
    title: fallback.title,
    engine: fallback.engine,
    code: fallback.code,
    multiplayer: fallback.multiplayer,
    multiplayerProvider: fallback.multiplayerProvider,
    multiplayerRoomType: fallback.multiplayerRoomType,
    runtimeEnv: fallback.runtimeEnv ?? {},
    createdAt: fallback.createdAt,
  };
}

export async function forkPublishedGame(gameId: string | ObjectId) {
  await ensureDbSetup();
  const db = getDb();

  const publishedDoc = await db
    .collection<PublishedGameDocument>("published_games")
    .findOne({ _id: toObjectId(gameId) });
  if (!publishedDoc) return null;

  const title = `${publishedDoc.title} (Remix)`;

  // If a source revision exists, fork from it (preserves files, assets, controls)
  if (publishedDoc.revisionId) {
    const revision = await db
      .collection<ProjectRevisionDocument>("project_revisions")
      .findOne({ _id: publishedDoc.revisionId });

    if (revision) {
      const compiledHtml = await resolveTextArtifact(revision.compiledHtml);

      const snapshot: SaveProjectSnapshotRequest = {
        title,
        engine: revision.engine,
        currentCode: compiledHtml,
        projectFiles: revision.projectFiles,
        controls: revision.controls,
        planningTodos: [],
        generatedImages: revision.generatedImages,
        audioTracks: revision.audioTracks,
        runtimeEnv: revision.runtimeEnv ?? {},
        chatMessages: [],
      };

      return createProjectFromSnapshot(snapshot);
    }
  }

  // Fallback: no revision — use compiled HTML as a single-file project
  const code = await resolveTextArtifact(publishedDoc.compiledHtml);

  const snapshot: SaveProjectSnapshotRequest = {
    title,
    engine: publishedDoc.engine,
    currentCode: code,
    projectFiles: [{ path: "index.html", content: code, kind: "html" }],
    controls: [],
    planningTodos: [],
    generatedImages: [],
    audioTracks: [],
    runtimeEnv: {},
    chatMessages: [],
  };

  return createProjectFromSnapshot(snapshot);
}

export async function createStandalonePublishedGame(snapshot: {
  title?: string | null;
  engine?: "canvas2d" | "threejs";
  code: string;
}) {
  const title =
    snapshot.title?.trim() ||
    snapshot.code.match(/<title>(.*?)<\/title>/i)?.[1]?.trim() ||
    "Untitled Game";
  const multiplayerMeta = detectPublishedGameMultiplayer(snapshot.code);
  try {
    await ensureDbSetup();
    const db = getDb();

    const compiledHtml = await createTextArtifactRef({
      kind: "compiled-html",
      text: snapshot.code,
      contentType: "text/html;charset=utf-8",
      inlineLimitBytes: INLINE_TEXT_BYTES_LIMIT,
    });

    const publishedGameId = new ObjectId();
    const doc: PublishedGameDocument = {
      _id: publishedGameId,
      schemaVersion: PROJECT_SCHEMA_VERSION,
      projectId: null,
      revisionId: null,
      revisionNumber: null,
      title,
      engine: snapshot.engine ?? "canvas2d",
      multiplayer: multiplayerMeta.multiplayer,
      multiplayerProvider: multiplayerMeta.multiplayerProvider,
      multiplayerRoomType: multiplayerMeta.multiplayerRoomType,
      runtimeEnv: {},
      compiledHtml,
      createdAt: new Date(),
    };

    await db.collection<PublishedGameDocument>("published_games").insertOne(doc);
    return {
      id: publishedGameId.toHexString(),
      title,
    };
  } catch (error) {
    logOptionalDbFailure("Standalone publish", error);
    const id = `local-${randomUUID()}`;
    getFallbackPublishedGamesStore().set(id, {
      id,
      title,
      engine: snapshot.engine ?? "canvas2d",
      code: snapshot.code,
      multiplayer: multiplayerMeta.multiplayer,
      multiplayerProvider: multiplayerMeta.multiplayerProvider,
      multiplayerRoomType: multiplayerMeta.multiplayerRoomType,
      runtimeEnv: {},
      createdAt: new Date(),
    });
    return { id, title };
  }
}

export async function listPublishedGames(limit = 60) {
  const cappedLimit = Math.max(1, Math.min(200, Math.floor(limit)));
  try {
    await ensureDbSetup();
    const docs = await getDb()
      .collection<PublishedGameDocument>("published_games")
      .find({})
      .sort({ createdAt: -1 })
      .limit(cappedLimit)
      .toArray();

    return docs.map((doc) => ({
      id: doc._id.toHexString(),
      projectId: doc.projectId?.toHexString() ?? null,
      revisionId: doc.revisionId?.toHexString() ?? null,
      revisionNumber: doc.revisionNumber,
      title: doc.title,
      engine: doc.engine,
      multiplayer: doc.multiplayer ?? false,
      multiplayerProvider: doc.multiplayerProvider ?? null,
      multiplayerRoomType: doc.multiplayerRoomType ?? null,
      runtimeEnv: doc.runtimeEnv ?? {},
      createdAt: doc.createdAt,
    }));
  } catch (error) {
    logOptionalDbFailure("Published games listing", error);
    return Array.from(getFallbackPublishedGamesStore().values())
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, cappedLimit)
      .map((game) => ({
        id: game.id,
        projectId: null,
        revisionId: null,
        revisionNumber: null,
        title: game.title,
        engine: game.engine,
        multiplayer: game.multiplayer,
        multiplayerProvider: game.multiplayerProvider,
        multiplayerRoomType: game.multiplayerRoomType,
        runtimeEnv: game.runtimeEnv ?? {},
        createdAt: game.createdAt,
      }));
  }
}
