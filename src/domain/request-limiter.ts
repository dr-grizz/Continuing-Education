/** Bounded, process-local windows for the single-instance demo, not a shared store. */
export class RequestLimiter {
  private windows = new Map<string, { count: number; expires: number }>();
  constructor(private readonly capacity = 4096) {}
  consume(key: string, limit: number, now = Date.now(), windowMs = 60_000) {
    let row = this.windows.get(key);
    if (!row || row.expires <= now) {
      for (const [id, item] of this.windows)
        if (item.expires <= now) this.windows.delete(id);
      if (this.windows.size >= this.capacity) return 60;
      row = { count: 0, expires: now + windowMs };
      this.windows.set(key, row);
    }
    if (row.count >= limit)
      return Math.max(1, Math.ceil((row.expires - now) / 1000));
    row.count++;
    return 0;
  }
}
