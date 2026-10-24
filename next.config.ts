import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  serverExternalPackages: ["@anthropic-ai/sdk"],
  // The "What is real" panel reads the proof table from CLAUDE.md at runtime.
  outputFileTracingIncludes: { "/api/proof": ["./CLAUDE.md"] },
};

export default config;
