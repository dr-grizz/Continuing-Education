import type { NextConfig } from "next";
import path from "node:path";
const root = path.resolve(__dirname, "../..");
const config: NextConfig = {
  poweredByHeader: false,
  output: "standalone",
  async headers() {
    return [
      {
        source: "/credential-tools/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'self'",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "no-store" },
        ],
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
