import path from "node:path";
import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  // The Docker image runs `.next/standalone/apps/admin/server.js`. `/api/*` is forwarded to the
  // admin API by `src/app/api/[...path]/route.ts`, which reads ADMIN_API_URL at
  // request time (and serves the built-in mock API in development when it is unset).
  output: "standalone",
  poweredByHeader: false,
  devIndicators: false,
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    // npm workspace root: the shared lockfile and hoisted node_modules live two levels up.
    root: path.join(__dirname, "../.."),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
