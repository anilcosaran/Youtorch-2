import { defineConfig } from "eslint/config";
import config from "@modelvend/config-eslint";

export default defineConfig([
  ...config,
  // Not a Next.js app: there are no pages to link to, and the rule warns when it can't find them.
  { rules: { "@next/next/no-html-link-for-pages": "off" } },
]);
