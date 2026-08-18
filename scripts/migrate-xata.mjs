import { readFile } from "node:fs/promises";
import { neon } from "@neondatabase/serverless";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required to migrate Xata.");
}

const schemaUrl = new URL("../db/schema-statements.json", import.meta.url);
const statements = JSON.parse(await readFile(schemaUrl, "utf8"));
const sql = neon(connectionString);

for (const statement of statements) {
  await sql.query(statement);
}

console.log(`Xata schema ready: ${statements.length} idempotent statements applied.`);
