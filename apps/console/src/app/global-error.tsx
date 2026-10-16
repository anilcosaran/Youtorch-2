"use client";

import { useEffect } from "react";
import { site } from "@/config/site";

// Replaces the root layout, so globals.css and the theme are not available: styles stay inline.
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#0a0a0a",
          color: "#fafafa",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          textAlign: "center",
        }}
      >
        <title>{`Something went wrong · ${site.name}`}</title>
        <div style={{ maxWidth: 420, padding: 24 }}>
          <p
            style={{
              fontFamily: "ui-monospace, monospace",
              fontSize: 12,
              letterSpacing: "0.18em",
              color: "#737373",
              textTransform: "uppercase",
            }}
          >
            {error.digest ? `Error · ${error.digest}` : "Error"}
          </p>
          <h1 style={{ margin: "8px 0 0", fontSize: 28, fontWeight: 600, letterSpacing: "-0.02em" }}>{site.product} is unavailable</h1>
          <p style={{ margin: "8px 0 0", fontSize: 15, lineHeight: 1.6, color: "#a3a3a3" }}>
            An unexpected error stopped the console from loading. Please try again.
          </p>
          <button
            onClick={() => retry()}
            style={{
              marginTop: 28,
              height: 40,
              padding: "0 16px",
              border: 0,
              borderRadius: 10,
              background: "#fafafa",
              color: "#0a0a0a",
              fontSize: 14,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
