import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  if (process.env.PROTOTYPE_MODE !== "true")
    return new NextResponse(null, { status: 503 });
  const signature = request.headers.get("stripe-signature");
  if (!signature) return new NextResponse(null, { status: 400 });
  // Bound the sole public write endpoint before buffering untrusted bytes.
  const limit = 1024 * 1024;
  if (Number(request.headers.get("content-length")) > limit)
    return new NextResponse(null, { status: 413 });
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (reader) {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > limit) {
          await reader.cancel();
          return new NextResponse(null, { status: 413 });
        }
        chunks.push(value);
      }
    } catch {
      return new NextResponse(null, { status: 400 });
    }
  }
  // Never parse/re-serialize signed bytes or add broker credentials. The API
  // verifies the signature and rejects live events before recording payment.
  try {
    const upstream = await fetch(
      `${process.env.API_URL || "http://127.0.0.1:3051"}/api/v1/webhooks/stripe`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Stripe-Signature": signature,
        },
        body: Buffer.concat(chunks),
        redirect: "error",
        signal: AbortSignal.timeout(30_000),
      },
    );
    return new NextResponse(await upstream.text(), {
      status: upstream.status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return new NextResponse(null, { status: 503 });
  }
}
