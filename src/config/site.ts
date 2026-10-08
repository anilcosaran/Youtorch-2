const env = (value: string | undefined, fallback: string) => (value && value.trim()) || fallback;

export const site = {
  name: "Youtorch",
  product: "Youtorch Console",
  description: "One API for every generative video, image and audio model.",
  url: env(process.env.NEXT_PUBLIC_SITE_URL, "https://app.youtorch.ai"),
  apiBase: env(process.env.NEXT_PUBLIC_API_BASE_URL, "https://api.youtorch.ai/v1"),
  docsUrl: env(process.env.NEXT_PUBLIC_DOCS_URL, "https://docs.youtorch.ai"),
  /** Prefix of secret keys, e.g. yt_live_… */
  keyPrefix: "yt",
  user: {
    firstName: "Anıl",
    fullName: "Anıl Asistant",
    email: "anil@youtorch.ai",
  },
  workspace: {
    name: "Youtorch Studio",
    plan: "Pay as you go",
  },
} as const;

export const themeStorageKey = "youtorch-theme";
