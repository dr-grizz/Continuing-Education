import { NextRequest, NextResponse } from "next/server";
import {
  readRequestBody,
  RequestBodyError,
} from "../../../../server/request-body";

export async function POST(request: NextRequest) {
  if (process.env.PROTOTYPE_MODE !== "true")
    return new NextResponse(null, { status: 503 });
  const signature = request.headers.get("stripe-signature");
  if (!signature) return new NextResponse(null, { status: 400 });
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
        body: await readRequestBody(request, 1024 * 1024),
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
  } catch (error) {
    if (error instanceof RequestBodyError)
      return new NextResponse(null, { status: error.status });
    return new NextResponse(null, { status: 503 });
  }
}
