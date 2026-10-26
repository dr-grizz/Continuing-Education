import { NextRequest } from "next/server";
import { badgeProxy } from "../../../../server/badges";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function proxy(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return badgeProxy(request, (await context.params).path);
}
export const GET = proxy;
export const POST = proxy;
