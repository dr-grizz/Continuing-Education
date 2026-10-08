import { NextRequest, NextResponse } from "next/server";

// Sales page images, served from the API's media store. Public, because
// published pages show them; image ids are random and unguessable.
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/.test(id))
    return NextResponse.json({ message: "Not found." }, { status: 404 });
  try {
    const response = await fetch(
      `${process.env.API_URL || "http://127.0.0.1:3001"}/api/v1/media/${id}`,
      { cache: "no-store", signal: AbortSignal.timeout(10000) },
    );
    if (!response.ok)
      return NextResponse.json(
        { message: "Image not found." },
        { status: response.status },
      );
    return new NextResponse(response.body, {
      headers: {
        "Content-Type": response.headers.get("content-type") ?? "",
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json(
      { message: "The local API is unavailable." },
      { status: 503 },
    );
  }
}
