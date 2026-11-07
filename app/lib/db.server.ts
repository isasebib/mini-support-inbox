import { MongoClient, type Collection } from "mongodb";
import type { Order, SupportMessage } from "./types";

// Load variables from .env into process.env (Node 21+ built-in, no dotenv needed).
// Ignored if the file doesn't exist, e.g. in production where env vars are set directly.
try {
  process.loadEnvFile();
} catch {}

// Vite reloads server modules on every change in dev. Caching the client on
// globalThis keeps one connection pool instead of opening a new one per reload.
declare global {
  var __mongoClient: Promise<MongoClient> | undefined;
}

function getClient(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not set. Copy .env.example to .env and add your Atlas connection string.");
  }
  if (!globalThis.__mongoClient) {
    globalThis.__mongoClient = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 })
      .connect()
      .catch((err) => {
        // Don't cache a failed connection, so the next request can retry.
        globalThis.__mongoClient = undefined;
        throw err;
      });
  }
  return globalThis.__mongoClient;
}

/** Typed handles to the two collections the app uses. */
export async function getCollections(): Promise<{
  messages: Collection<SupportMessage>;
  orders: Collection<Order>;
}> {
  // Atlas URIs usually don't include a database name, so we pick one here.
  const db = (await getClient()).db(process.env.MONGODB_DB ?? "mini_support_inbox");
  return {
    messages: db.collection<SupportMessage>("messages"),
    orders: db.collection<Order>("orders"),
  };
}
