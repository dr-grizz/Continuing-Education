import type { NextConfig } from "next";
import path from "node:path";
const root = path.resolve(__dirname, "../..");
const config: NextConfig = {
  poweredByHeader: false,
  turbopack: { root },
  outputFileTracingRoot: root,
};
export default config;
