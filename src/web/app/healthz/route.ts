export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const response = await fetch(
      `${process.env.API_URL || "http://127.0.0.1:3051"}/api/v1/health`,
      {
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(3000),
      },
    );
    return new Response(response.ok ? "ok" : "unavailable", {
      status: response.ok ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return new Response("unavailable", { status: 503 });
  }
}
