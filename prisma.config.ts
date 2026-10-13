import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// Prisma Migrate needs Neon's direct host (not the pooled one the app uses) and a longer
// connect timeout, so a suspended Neon compute has time to wake up.
function migrateUrl() {
  const url = new URL(
    process.env.DIRECT_URL ?? env("DATABASE_URL").replace("-pooler.", "."),
  );
  if (!url.searchParams.has("connect_timeout")) {
    url.searchParams.set("connect_timeout", "30");
  }
  return url.toString();
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx --tsconfig ./tsconfig.json src/db/seed.ts",
  },
  datasource: {
    url: migrateUrl(),
  },
});
