import "dotenv/config";
import { defineConfig } from "prisma/config";
// Local prototype only: the database URL comes from the ignored .env file. It may be
// absent during `npm ci` (before `npm run setup`), when only `prisma generate` runs.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: process.env.DATABASE_URL },
});
