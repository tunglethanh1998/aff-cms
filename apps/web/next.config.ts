import type { NextConfig } from "next";

const ASSET_CACHE = `public, max-age=31536000, immutable`;
const STATIC_ASSET_PATTERNS = ["/images/(.*)"];

const nextConfig: NextConfig = {
  output: "standalone",

  async headers() {
    return [
      ...STATIC_ASSET_PATTERNS.map((source) => ({
        source,
        headers: [
          {
            key: "Cache-Control",
            value: ASSET_CACHE,
          },
        ],
      })),
    ];
  },
};

export default nextConfig;
