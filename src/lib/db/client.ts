import { GridFSBucket, MongoClient } from "mongodb";

const DATABASE_NAME = "gameforge";
const ARTIFACT_BUCKET_NAME = "artifacts";
const DB_SETUP_RETRY_MS = 60_000;

const options = {
  maxPoolSize: 10,
  minPoolSize: 0,
  maxIdleTimeMS: 30_000,
  serverSelectionTimeoutMS: 5_000,
};

declare global {
  var _mongoClient: MongoClient | undefined;
  var _mongoSetupPromise: Promise<void> | undefined;
  var _mongoSetupError: Error | undefined;
  var _mongoSetupFailedAt: number | undefined;
  var _mongoOptionalWarnings: Set<string> | undefined;
}

function getUri(): string {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI environment variable is not set");
  }
  return uri;
}

function normalizeMongoError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  return new Error(String(error));
}

function getClient(): MongoClient {
  if (process.env.NODE_ENV === "development") {
    if (!globalThis._mongoClient) {
      globalThis._mongoClient = new MongoClient(getUri(), options);
    }
    return globalThis._mongoClient;
  }

  return new MongoClient(getUri(), options);
}

export function getDb() {
  return getClient().db(DATABASE_NAME);
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
      try {
        const client = getClient();
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
        globalThis._mongoSetupError = undefined;
        globalThis._mongoSetupFailedAt = undefined;
        globalThis._mongoOptionalWarnings?.clear();
      } catch (error) {
        globalThis._mongoSetupError = normalizeMongoError(error);
        globalThis._mongoSetupFailedAt = Date.now();
        throw globalThis._mongoSetupError;
      }
    })();
  }

  await globalThis._mongoSetupPromise;
}
