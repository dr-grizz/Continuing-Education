import "dotenv/config";
import { Pool } from "pg";
import { assertPrototypeRuntime, assertHostedDatabase } from "./hosted-demo";
const hosted = assertPrototypeRuntime();
if (hosted) assertHostedDatabase(process.env.DATABASE_URL);
if (!process.env.DATABASE_URL) throw new Error("Run npm run setup first.");
export const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ...(hosted ? { max: 5, connectionTimeoutMillis: 15_000 } : {}),
});
export const DEMO_LEARNER = "00000000-0000-4000-8000-000000000001";
