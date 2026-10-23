import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function getDb() {
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding DB is unavailable. Attach your gazeradar-db database to the Worker using the DB binding."
    );
  }

  return drizzle(env.DB, { schema });
}
