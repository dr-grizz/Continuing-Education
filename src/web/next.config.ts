import type { NextConfig } from "next";
import path from "node:path";
// Resolve from this config, including when Next uses a temporary module.
const { baselineSecurityHeaders, credentialSecurityHeaders } = require(
  path.join(__dirname, "server/security-headers.ts"),
) as typeof import("./server/security-headers");
const root = path.resolve(__dirname, "../..");
const { version } = require(path.join(root, "package.json")) as {
  version: string;
};
const releaseRevision = process.env.RELEASE_SHA || process.env.GITHUB_SHA || "";
const config: NextConfig = {
  poweredByHeader: false,
  output: "standalone",
  // Explicit public allowlist: never expose arbitrary runtime settings.
  env: {
    NEXT_PUBLIC_APP_VERSION: version,
    NEXT_PUBLIC_RELEASE_REVISION: /^[a-f0-9]{7,64}$/i.test(releaseRevision)
      ? releaseRevision.slice(0, 7)
      : "",
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: Object.entries(baselineSecurityHeaders).map(
          ([key, value]) => ({ key, value }),
        ),
      },
      {
        source: "/credential-tools/:path*",
        headers: Object.entries(credentialSecurityHeaders).map(
          ([key, value]) => ({ key, value }),
        ),
      },
    ];
  },
  // Set by `npm run dev:lan` so devices on the local network get dev assets.
  // Started on 0.0.0.0, the dev server no longer trusts 127.0.0.1 by itself.
  ...(process.env.LAN_HOST
    ? { allowedDevOrigins: [process.env.LAN_HOST, "127.0.0.1"] }
    : {}),
  turbopack: { root },
  outputFileTracingRoot: root,
};
export default config;
