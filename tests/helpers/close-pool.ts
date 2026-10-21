import type { Pool } from "pg";

/** pg-pool can resolve end() before idle clients finish closing their sockets.
 * Wait for the public remove events before dropping a disposable database. */
export async function endPoolAndWaitForClients(pool: Pool) {
  let remaining = pool.totalCount;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onRemove: (() => void) | undefined;
  const disconnected = new Promise<void>((resolve, reject) => {
    if (remaining === 0) return resolve();
    onRemove = () => {
      if (--remaining === 0) resolve();
    };
    pool.on("remove", onRemove);
    timer = setTimeout(
      () =>
        reject(
          new Error(
            "Timed out waiting for test database connections to close.",
          ),
        ),
      10_000,
    );
  });
  try {
    await Promise.all([pool.end(), disconnected]);
  } finally {
    if (timer) clearTimeout(timer);
    if (onRemove) pool.removeListener("remove", onRemove);
  }
}
