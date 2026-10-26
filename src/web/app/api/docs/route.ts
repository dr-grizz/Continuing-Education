// Same-origin OpenAPI reference works both locally and behind the demo gate.
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const upstream = await fetch(
      `${process.env.API_URL || "http://127.0.0.1:3051"}/api/openapi.json`,
      {
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(5000),
      },
    );
    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return new Response("API reference unavailable.", { status: 503 });
  }
}
