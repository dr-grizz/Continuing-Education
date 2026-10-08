import type { NextConfig } from "next";
import path from "node:path";
const root = path.resolve(__dirname, "../..");
const config: NextConfig = {
  poweredByHeader: false,
  // Set by `npm run dev:lan` so devices on the local network get dev assets.
  ...(process.env.LAN_HOST
    ? { allowedDevOrigins: [process.env.LAN_HOST] }
    : {}),
  turbopack: { root },
  outputFileTracingRoot: root,
};
export default config;
