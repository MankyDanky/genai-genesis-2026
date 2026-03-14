import { MongoClient } from "mongodb";

function getUri(): string {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI environment variable is not set");
  }
  return uri;
}

const options = {
  maxPoolSize: 10,
  minPoolSize: 0,
  maxIdleTimeMS: 30_000,
};

declare global {
  var _mongoClient: MongoClient | undefined;
}

function getClient(): MongoClient {
  const uri = getUri();
  if (process.env.NODE_ENV === "development") {
    if (!globalThis._mongoClient) {
      globalThis._mongoClient = new MongoClient(uri, options);
    }
    return globalThis._mongoClient;
  }
  return new MongoClient(uri, options);
}

const client = getClient();

export const db = client.db("gameforge");
