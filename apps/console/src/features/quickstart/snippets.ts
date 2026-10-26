import { apiKeyEnv, type Snippets } from "@/components/code/snippets";
import { site } from "@/config/site";

export const exportKey = `export ${apiKeyEnv}="${site.keyPrefix}_live_..."`;

/** There are no SDKs yet: the examples use plain HTTP clients. */
export const installSnippets: Snippets = {
  curl: "# Nothing to install: every endpoint is plain HTTPS + JSON",
  python: "pip install requests",
  node: "# Node.js 18+ has fetch built in; nothing to install",
};

export const authSnippets: Snippets = { curl: exportKey, python: exportKey, node: exportKey };
