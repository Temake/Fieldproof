import type { NextConfig } from "next";

const config: NextConfig = {
  // The API is a separate FastAPI service (PRD 15.1). Proxying in dev keeps the
  // browser on one origin so no CORS preflight sits between the click and the
  // timeline update.
  async rewrites() {
    const api = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
    return [{ source: "/api/:path*", destination: `${api}/api/:path*` }];
  },
};

export default config;
