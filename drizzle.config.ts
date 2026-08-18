import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./drizzle-pg",
  schema: "./db/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://xata:local@localhost:5432/xata",
  },
});
