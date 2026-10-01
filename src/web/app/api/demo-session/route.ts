import { NextRequest, NextResponse } from "next/server";
const cookie = "ce-demo-learner";
async function session(request: NextRequest) {
  if (process.env.PROTOTYPE_MODE !== "true")
    return NextResponse.json(
      { message: "Prototype is disabled." },
      { status: 503 },
    );
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.LEARNER_API_TOKEN}`,
    };
    const id = request.cookies.get(cookie)?.value;
    if (request.method === "GET" && !id)
      return NextResponse.json({ email: null });
    if (id && request.method === "GET") headers["X-Prototype-Learner-Id"] = id;
    const body = request.method === "POST" ? await request.json() : undefined;
    const upstream = await fetch(
      `${process.env.API_URL || "http://127.0.0.1:3001"}/api/v1/${body ? "prototype/users" : "me"}`,
      {
        method: body ? "POST" : "GET",
        headers,
        body: body
          ? JSON.stringify({
              email:
                typeof body.email === "string"
                  ? body.email.trim().toLowerCase()
                  : body.email,
            })
          : undefined,
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      },
    );
    const data = await upstream.json();
    const response = NextResponse.json(data, { status: upstream.status });
    if (upstream.ok && body)
      response.cookies.set(cookie, data.id, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
      });
    if (upstream.status === 401) response.cookies.delete(cookie);
    return response;
  } catch {
    return NextResponse.json(
      { message: "Unable to reach the local API. Try again." },
      { status: 503 },
    );
  }
}
export const GET = session;
export const POST = session;
export async function DELETE() {
  const response = NextResponse.json({ email: null });
  response.cookies.delete(cookie);
  return response;
}
