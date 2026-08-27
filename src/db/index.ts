import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

// "server-only" throws when imported outside of Next.js server context.
// Skip it for standalone scripts (seed, migrations) via SKIP_SERVER_ONLY=1.
if (!process.env.SKIP_SERVER_ONLY) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("server-only");
}

type DB = ReturnType<typeof drizzle<typeof schema>>;

let client: ReturnType<typeof postgres> | null = null;
let dbInstance: DB | null = null;

function getDb(): DB {
  if (dbInstance) return dbInstance;

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local.");
  }

  // Single connection is fine for dev; postgres.js pools under the hood.
  client = postgres(url, { max: 10, prepare: false });
  dbInstance = drizzle(client, { schema });
  return dbInstance;
}

export const db = new Proxy<DB>({} as DB, {
  get(_target, prop) {
    const realDb = getDb();
    const value = (realDb as unknown as Record<string, unknown>)[prop as string];
    if (typeof value === "function") {
      return value.bind(realDb);
    }
    return value;
  },
}) as DB;

export type { DB };
export { schema };
