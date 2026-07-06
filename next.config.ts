import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite's WASM loader breaks when bundled — keep it external (dev DB only)
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;
