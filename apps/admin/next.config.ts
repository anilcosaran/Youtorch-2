import path from "node:path";
import type { NextConfig } from "next";

const dev = process.env.NODE_ENV === "development";

/*
 * Scripts need 'unsafe-inline': Next.js inlines its bootstrap and RSC payload,
 * and the root layout runs the sidebar and theme boot scripts before first
 * paint. Nonces would cover them, but they need every page rendered per
 * request, which cacheComponents and partial prerendering rule out (see
 * node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md).
 * Everything else is from this origin only: the console loads no third-party
 * script, font or image, calls only its own /api, and links to customers'
 * output files rather than embedding them.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  // React rebuilds server error stacks with eval in development only.
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  // Radix, Recharts and Sonner set inline styles.
  "style-src 'self' 'unsafe-inline'",
  // next/font serves the fonts from /_next/static.
  "font-src 'self'",
  "img-src 'self'",
  "media-src 'none'",
  // The dev server's hot reload socket.
  `connect-src 'self'${dev ? " ws: wss:" : ""}`,
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  // No upgrade-insecure-requests: every URL is relative, so it would only break `npm start` on http://localhost.
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
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
  // Workspace package shipped as TypeScript source (packages/admin-api).
  transpilePackages: ["@modelvend/admin-api"],
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
