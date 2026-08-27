import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

// "server-only" throws when imported outside of Next.js server context.
// Skip it for standalone scripts (seed, migrations) via SKIP_SERVER_ONLY=1.
if (!process.env.SKIP_SERVER_ONLY) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("server-only");
}

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local.");
}

// Single connection is fine for dev; postgres.js pools under the hood.
const client = postgres(url, { max: 10, prepare: false });

export const db = drizzle(client, { schema });
export type DB = typeof db;
export { schema };
