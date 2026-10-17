/** The console's display name; UI copy reads it from here. */
export const BRAND = {
  name: process.env.NEXT_PUBLIC_CONSOLE_NAME || "Modelvend Admin",
  /** The customer console, for "open as customer" links. */
  consoleUrl: process.env.NEXT_PUBLIC_CONSOLE_URL || "https://app.modelvend.ai",
} as const;
