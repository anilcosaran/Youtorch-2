import type { MetadataRoute } from "next";

// The console is an authenticated app, not marketing content.
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
