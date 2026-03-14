import { once } from "events";
import { ObjectId } from "mongodb";
import { ensureDbSetup, getArtifactBucket, getDb } from "@/lib/db/client";
import type { ArtifactDocument, ArtifactKind, ArtifactRef } from "@/lib/db/schema";

export const INLINE_TEXT_BYTES_LIMIT = 128 * 1024;
export const INLINE_JSON_BYTES_LIMIT = 256 * 1024;

function toObjectId(value: string | ObjectId) {
  return typeof value === "string" ? new ObjectId(value) : value;
}

function bufferByteLength(value: string) {
  return Buffer.byteLength(value, "utf8");
}

export async function createTextArtifactRef(args: {
  kind: Extract<ArtifactKind, "compiled-html" | "chat-transcript">;
  text: string;
  contentType: string;
  projectId?: string | ObjectId | null;
  revisionId?: string | ObjectId | null;
  inlineLimitBytes: number;
}): Promise<ArtifactRef> {
  const byteLength = bufferByteLength(args.text);
  if (byteLength <= args.inlineLimitBytes) {
    return {
      kind: args.kind,
      storage: "inline",
      contentType: args.contentType,
      byteLength,
      inlineText: args.text,
      artifactId: null,
    };
  }

  const artifactId = await storeBinaryArtifact({
    kind: args.kind,
    contentType: args.contentType,
    data: Buffer.from(args.text, "utf8"),
    projectId: args.projectId ?? null,
    revisionId: args.revisionId ?? null,
    filename: `${args.kind}.txt`,
  });

  return {
    kind: args.kind,
    storage: "gridfs",
    contentType: args.contentType,
    byteLength,
    artifactId,
    inlineText: null,
  };
}

export async function storeBinaryArtifact(args: {
  kind: Extract<ArtifactKind, "image-binary" | "audio-binary" | "mesh-binary" | "compiled-html" | "chat-transcript">;
  contentType: string;
  data: Buffer;
  filename: string;
  projectId?: string | ObjectId | null;
  revisionId?: string | ObjectId | null;
}) {
  await ensureDbSetup();
  const artifactBucket = getArtifactBucket();
  const db = getDb();

  const artifactId = new ObjectId();
  const uploadStream = artifactBucket.openUploadStreamWithId(artifactId, args.filename, {
    contentType: args.contentType,
    metadata: {
      kind: args.kind,
      projectId: args.projectId ? toObjectId(args.projectId) : null,
      revisionId: args.revisionId ? toObjectId(args.revisionId) : null,
    },
  });

  uploadStream.end(args.data);
  await once(uploadStream, "finish");

  const now = new Date();
  const doc: ArtifactDocument = {
    _id: artifactId,
    schemaVersion: 1,
    kind: args.kind,
    projectId: args.projectId ? toObjectId(args.projectId) : null,
    revisionId: args.revisionId ? toObjectId(args.revisionId) : null,
    contentType: args.contentType,
    byteLength: args.data.byteLength,
    gridFsFileId: artifactId,
    createdAt: now,
    updatedAt: now,
  };

  await db.collection<ArtifactDocument>("project_artifacts").insertOne(doc);
  return artifactId.toHexString();
}

export async function readArtifactDocument(artifactId: string | ObjectId) {
  await ensureDbSetup();
  return getDb()
    .collection<ArtifactDocument>("project_artifacts")
    .findOne({ _id: toObjectId(artifactId) });
}

export async function readArtifactBuffer(artifactId: string | ObjectId) {
  await ensureDbSetup();
  const doc = await readArtifactDocument(artifactId);
  if (!doc) return null;

  const artifactBucket = getArtifactBucket();
  const stream = artifactBucket.openDownloadStream(doc.gridFsFileId);
  const chunks: Buffer[] = [];

  await new Promise<void>((resolve, reject) => {
    stream.on("data", (chunk: Buffer | Uint8Array) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    stream.on("end", () => resolve());
    stream.on("error", reject);
  });

  return {
    doc,
    buffer: Buffer.concat(chunks),
  };
}

export async function resolveTextArtifact(ref: ArtifactRef) {
  if (ref.storage === "inline") {
    return ref.inlineText ?? "";
  }

  if (!ref.artifactId) {
    throw new Error(`Artifact ref for ${ref.kind} is missing artifactId`);
  }

  const stored = await readArtifactBuffer(ref.artifactId);
  if (!stored) {
    throw new Error(`Artifact ${ref.artifactId} was not found`);
  }

  return stored.buffer.toString("utf8");
}
