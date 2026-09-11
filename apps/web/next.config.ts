import type { NextConfig } from "next";

// The browser talks to the FieldProof API only through app/api/[...path],
// which adds the API key on the server. There is deliberately no rewrite:
// a rewrite would forward requests without that header.
const config: NextConfig = {
  // Lets a production build run beside a dev server without sharing .next.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    optimizePackageImports: ["@phosphor-icons/react"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=()" },
        ],
      },
    ];
  },
};

export default config;
