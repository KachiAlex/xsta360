import "server-only";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local.");
}

// Single connection is fine for dev; postgres.js pools under the hood.
const client = postgres(url, { max: 10, prepare: false });

export const db = drizzle(client, { schema });
export type DB = typeof db;
export { schema };
