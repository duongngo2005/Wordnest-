import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Node 24 can close TypeScript CLI's output pipe before Next parses --showConfig.
  // TypeScript's in-process API is installed and avoids that build-only failure.
  experimental: {
    useTypeScriptCli: false,
  },
  allowedDevOrigins: ["192.168.88.206", "127.0.0.1", "duong-server.tail34adcb.ts.net"],
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          {
            key: "Service-Worker-Allowed",
            value: "/",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
