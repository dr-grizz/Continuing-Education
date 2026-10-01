import { NextRequest, NextResponse } from "next/server";
async function proxy(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  if (process.env.PROTOTYPE_MODE !== "true")
    return NextResponse.json(
      { message: "Prototype is disabled." },
      { status: 503 },
    );
  const { path } = await context.params;
  const role = request.headers.get("x-prototype-role") || "learner";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const token =
    role === "staff"
      ? process.env.STAFF_API_TOKEN
      : process.env.LEARNER_API_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  const learnerId = request.cookies.get("ce-demo-learner")?.value;
  if (role !== "staff" && learnerId)
    headers["X-Prototype-Learner-Id"] = learnerId;
  if (
    role !== "staff" &&
    !learnerId &&
    (path[0] === "me" ||
      path[0] === "registrations" ||
      path[0] === "operations" ||
      path[0] === "prototype")
  )
    return NextResponse.json(
      { message: "Sign in to continue." },
      { status: 401 },
    );
  const key = request.headers.get("idempotency-key");
  if (key) headers["Idempotency-Key"] = key;
  try {
    const response = await fetch(
      `${process.env.API_URL || "http://127.0.0.1:3001"}/api/v1/${path.map(encodeURIComponent).join("/")}${request.nextUrl.search}`,
      {
        method: request.method,
        headers,
        body: request.method === "GET" ? undefined : await request.text(),
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      },
    );
    return new NextResponse(await response.text(), {
      status: response.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return NextResponse.json(
      { message: "The local API is unavailable. Start it with npm run dev." },
      { status: 503 },
    );
  }
}
export const GET = proxy;
export const POST = proxy;
