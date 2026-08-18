import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";

export function getDb() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required for Xata PostgreSQL.");
  }

  const pool = new Pool({ connectionString, max: 4 });
  return drizzle(pool, { schema });
}
