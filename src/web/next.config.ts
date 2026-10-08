import type { NextConfig } from "next";
import path from "node:path";
const root = path.resolve(__dirname, "../..");
const config: NextConfig = {
  poweredByHeader: false,
  // Set by `npm run dev:lan` so devices on the local network get dev assets.
  // Started on 0.0.0.0, the dev server no longer trusts 127.0.0.1 by itself.
  ...(process.env.LAN_HOST
    ? { allowedDevOrigins: [process.env.LAN_HOST, "127.0.0.1"] }
    : {}),
  turbopack: { root },
  outputFileTracingRoot: root,
};
export default config;
