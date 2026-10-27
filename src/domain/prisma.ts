import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "../generated/prisma/client";
// Importing db enforces the demo runtime guard and shares its pg pool with Prisma.
import { db } from "./db";

export const prisma = new PrismaClient({ adapter: new PrismaPg(db) });
export type Tx = Prisma.TransactionClient;
type Executor = Tx | typeof prisma;

// Raw SQL for row/advisory locks, computed columns and worker claiming (issue #2).
// Values are always bound parameters ($1, $2…), never interpolated into the text.
// Wrap functions that return void (such as pg_advisory_xact_lock) in a SELECT that
// returns a value, and cast counts to integer: Prisma cannot read void and returns
// bigint for uncast counts.
export function sql<T = Record<string, any>>(
  executor: Executor,
  text: string,
  ...params: unknown[]
): Promise<T[]> {
  return executor.$queryRawUnsafe<T[]>(text, ...params);
}

// One interactive transaction per workflow; generous limits allow for lock waits.
export function transaction<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
  return prisma.$transaction(work, { maxWait: 10_000, timeout: 20_000 });
}

// Offering columns without start_date/end_date, which queries reselect as YYYY-MM-DD text.
export const offeringColumns = (alias: string) =>
  Object.values(Prisma.OfferingsScalarFieldEnum)
    .filter((column) => column !== "start_date" && column !== "end_date")
    .map((column) => `${alias}.${column}`)
    .join(",");
