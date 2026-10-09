import { apiKeyEnv, type Snippets } from "@/components/code/snippets";
import { site } from "@/config/site";

export const exportKey = `export ${apiKeyEnv}="${site.keyPrefix}_live_..."`;
const hookUrl = "https://your.app/hooks/youtorch";

export const installSnippets: Snippets = {
  curl: "# No SDK needed, every endpoint is plain HTTPS + JSON",
  python: "pip install youtorch",
  node: "npm install @youtorch/sdk",
};

export const authSnippets: Snippets = { curl: exportKey, python: exportKey, node: exportKey };

export const webhookSnippets: Snippets = {
  curl: `curl ${site.apiBase}/webhooks \\
  -H "Authorization: Bearer $${apiKeyEnv}" \\
  -d '{ "url": "${hookUrl}", "events": ["generation.completed"] }'`,
  python: `client.webhooks.create(
    url="${hookUrl}",
    events=["generation.completed"],
)`,
  node: `await youtorch.webhooks.create({
  url: "${hookUrl}",
  events: ["generation.completed"],
});`,
};
