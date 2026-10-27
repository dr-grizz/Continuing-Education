import "dotenv/config";
import { defineConfig } from "prisma/config";
// The migration wrapper supplies the direct database URL to Prisma. The URL may
// be absent during `npm ci`, when only `prisma generate` runs.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: process.env.DATABASE_URL },
});
