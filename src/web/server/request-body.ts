export class RequestBodyError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
let activeReads = 0;

/** Limit bytes while reading, including chunked requests without Content-Length. */
export async function readRequestBody(
  request: Request,
  limit = 8 * 1024 * 1024,
  timeoutMs = 10_000,
): Promise<Buffer<ArrayBuffer>> {
  if (Number(request.headers.get("content-length")) > limit)
    throw new RequestBodyError(413, "Request body is too large.");
  const reader = request.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  if (activeReads >= 4) {
    void reader.cancel().catch(() => {});
    throw new RequestBodyError(503, "Too many uploads. Try again shortly.");
  }
  activeReads++;
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new RequestBodyError(408, "Request body read timed out."));
      void reader.cancel().catch(() => {});
    }, timeoutMs);
  });
  try {
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), deadline]);
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        void reader.cancel().catch(() => {});
        throw new RequestBodyError(413, "Request body is too large.");
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks, size);
  } catch (error) {
    if (error instanceof RequestBodyError) throw error;
    throw new RequestBodyError(400, "Request body could not be read.");
  } finally {
    if (timer) clearTimeout(timer);
    activeReads--;
  }
}
