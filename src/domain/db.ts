import "dotenv/config";
import { Pool } from "pg";
if (
  process.env.PROTOTYPE_MODE !== "true" ||
  process.env.NODE_ENV === "production"
) {
  throw new Error(
    "This prototype must run locally with PROTOTYPE_MODE=true, outside production.",
  );
}
if (!process.env.DATABASE_URL) throw new Error("Run npm run setup first.");
export const db = new Pool({ connectionString: process.env.DATABASE_URL });
export const DEMO_LEARNER = "00000000-0000-4000-8000-000000000001";
