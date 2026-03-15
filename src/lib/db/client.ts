import { GridFSBucket, MongoClient } from "mongodb";

const DATABASE_NAME = "gameforge";
const ARTIFACT_BUCKET_NAME = "artifacts";
const DB_SETUP_RETRY_MS = 60_000;

const options = {
  maxPoolSize: 10,
  minPoolSize: 0,
  maxIdleTimeMS: 30_000,
  serverSelectionTimeoutMS: 5_000,
  retryWrites: true,
  retryReads: true,
  readPreference: "primary" as const,
};

declare global {
  var _mongoClient: MongoClient | undefined;
  var _mongoActiveUri: string | undefined;
  var _mongoSetupPromise: Promise<void> | undefined;
  var _mongoSetupError: Error | undefined;
  var _mongoSetupFailedAt: number | undefined;
  var _mongoOptionalWarnings: Set<string> | undefined;
}

function getConfiguredUris(): string[] {
  const directUri = process.env.MONGODB_URI_DIRECT?.trim();
  const srvUri = process.env.MONGODB_URI?.trim();
  const uris = [directUri, srvUri].filter(
    (value): value is string => typeof value === "string" && value.length > 0
  );
  if (uris.length === 0) {
    throw new Error("Set MONGODB_URI or MONGODB_URI_DIRECT");
  }
  return [...new Set(uris)];
}

function getPrimaryUri(): string {
  if (globalThis._mongoActiveUri) return globalThis._mongoActiveUri;
  const [uri] = getConfiguredUris();
  if (!uri) throw new Error("Set MONGODB_URI or MONGODB_URI_DIRECT");
  globalThis._mongoActiveUri = uri;
  return uri;
}

function normalizeMongoError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  return new Error(String(error));
}

function getClient(uri: string): MongoClient {
  if (!globalThis._mongoClient || globalThis._mongoActiveUri !== uri) {
    if (globalThis._mongoClient && globalThis._mongoActiveUri !== uri) {
      void globalThis._mongoClient.close().catch(() => {});
    }
    globalThis._mongoClient = new MongoClient(uri, options);
    globalThis._mongoActiveUri = uri;
  }
  return globalThis._mongoClient;
}

export function getDb() {
  return getClient(getPrimaryUri()).db(DATABASE_NAME);
}

/**
 * Reset the cached MongoClient (dev mode). Call this when a topology/election
 * error makes the existing connection unusable. The next `getDb()` call will
 * create a fresh client.
 */
export function resetClient() {
  if (globalThis._mongoClient) {
    void globalThis._mongoClient.close().catch(() => {});
  }
  globalThis._mongoClient = undefined;
  globalThis._mongoActiveUri = undefined;
  globalThis._mongoSetupPromise = undefined;
  globalThis._mongoSetupError = undefined;
  globalThis._mongoSetupFailedAt = undefined;
}

const STALE_TOPOLOGY_PATTERNS = [
  "setVersion mismatch",
  "electionId mismatch",
  "primary marked stale",
  "not primary",
  "node is recovering",
];

/**
 * Returns true if the error is a stale MongoDB topology / election error
 * that can be resolved by resetting the client.
 */
export function isStaleTopologyError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  const lower = msg.toLowerCase();
  return STALE_TOPOLOGY_PATTERNS.some((p) => lower.includes(p));
}

/**
 * Run an async database operation with one automatic retry on stale topology
 * errors. Resets the client before the retry so a fresh connection is used.
 */
export async function withTopologyRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (isStaleTopologyError(error)) {
      console.warn("[MongoDB] Stale topology detected, resetting client and retrying...");
      resetClient();
      return fn();
    }
    throw error;
  }
}

export function getArtifactBucket() {
  return new GridFSBucket(getDb(), { bucketName: ARTIFACT_BUCKET_NAME });
}

export function getDbSetupError() {
  return globalThis._mongoSetupError;
}

export function logOptionalDbFailure(scope: string, error: unknown) {
  if (!globalThis._mongoOptionalWarnings) {
    globalThis._mongoOptionalWarnings = new Set();
  }

  if (globalThis._mongoOptionalWarnings.has(scope)) {
    return;
  }

  globalThis._mongoOptionalWarnings.add(scope);
  const message = normalizeMongoError(error).message;
  console.warn(`[MongoDB] ${scope} disabled; using fallback storage. ${message}`);
}

export async function ensureDbSetup() {
  if (
    globalThis._mongoSetupError &&
    globalThis._mongoSetupFailedAt &&
    Date.now() - globalThis._mongoSetupFailedAt < DB_SETUP_RETRY_MS
  ) {
    throw globalThis._mongoSetupError;
  }

  if (
    globalThis._mongoSetupError &&
    globalThis._mongoSetupFailedAt &&
    Date.now() - globalThis._mongoSetupFailedAt >= DB_SETUP_RETRY_MS
  ) {
    globalThis._mongoSetupError = undefined;
    globalThis._mongoSetupFailedAt = undefined;
    globalThis._mongoSetupPromise = undefined;
  }

  if (!globalThis._mongoSetupPromise) {
    globalThis._mongoSetupPromise = (async () => {
      const uriErrors: string[] = [];
      for (const uri of getConfiguredUris()) {
        const client = getClient(uri);
        try {
          const db = client.db(DATABASE_NAME);
          await client.connect();
          await Promise.all([
            db.collection("projects").createIndex({ updatedAt: -1 }, { name: "updatedAt_desc" }),
            db
              .collection("project_revisions")
              .createIndex({ projectId: 1, revisionNumber: 1 }, { unique: true }),
            db.collection("published_games").createIndex({ projectId: 1, createdAt: -1 }),
            db.collection("project_artifacts").createIndex({ projectId: 1, createdAt: -1 }),
            db.collection("project_artifacts").createIndex({ revisionId: 1, kind: 1 }),
            db.collection("generated_audio_jobs").createIndex({ createdAt: -1 }),
          ]);
          globalThis._mongoActiveUri = uri;
          globalThis._mongoSetupError = undefined;
          globalThis._mongoSetupFailedAt = undefined;
          globalThis._mongoOptionalWarnings?.clear();
          return;
        } catch (error) {
          uriErrors.push(`${uri.replace(/\/\/.*@/, "//***@")}: ${normalizeMongoError(error).message}`);
          if (process.env.NODE_ENV !== "development") {
            await client.close().catch(() => {});
          }
        }
      }

      globalThis._mongoSetupError = new Error(
        `Mongo setup failed for all configured URIs. ${uriErrors.join(" | ")}`
      );
      globalThis._mongoSetupFailedAt = Date.now();
      throw globalThis._mongoSetupError;
    })();
  }

  await globalThis._mongoSetupPromise;
}
