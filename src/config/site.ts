const env = (value: string | undefined, fallback: string) => (value && value.trim()) || fallback;

export const site = {
  name: "Modelvend",
  product: "Modelvend Console",
  description: "One API for every generative video, image and audio model.",
  url: env(process.env.NEXT_PUBLIC_SITE_URL, "https://app.modelvend.ai"),
  apiBase: env(process.env.NEXT_PUBLIC_API_BASE_URL, "https://api.modelvend.ai/v1"),
  mcpUrl: env(process.env.NEXT_PUBLIC_MCP_URL, "https://mcp.modelvend.ai/mcp"),
  docsUrl: env(process.env.NEXT_PUBLIC_DOCS_URL, "https://docs.modelvend.ai"),
  /** Prefix of secret keys, e.g. mv_live_… */
  keyPrefix: "mv",
  user: {
    firstName: "Anıl",
    fullName: "Anıl Asistant",
    email: "anil@modelvend.ai",
  },
  workspace: {
    name: "Modelvend Studio",
    plan: "Pay as you go",
  },
} as const;

export const themeStorageKey = "modelvend-theme";
