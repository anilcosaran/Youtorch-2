import { apiKeyEnv } from "@/components/code/snippets";
import { site } from "@/config/site";

export type McpClientId = "claude" | "claude-code" | "chatgpt" | "codex" | "gemini" | "cursor";
export type McpClientIcon = "claude" | "openai" | "gemini" | "cursor";

export type McpClient = {
  id: McpClientId;
  name: string;
  kind: "App" | "CLI" | "Editor";
  icon: McpClientIcon;
  /** CLIs and editors need a key. Claude and ChatGPT sign in with OAuth. */
  needsKey: boolean;
  steps: string[];
  /** Label shown in the code block header, usually the file or command. */
  file: string;
  code: string;
};

const bearer = `Authorization: Bearer $${apiKeyEnv}`;

export const mcpClients: McpClient[] = [
  {
    id: "claude",
    name: "Claude",
    kind: "App",
    icon: "claude",
    needsKey: false,
    steps: [
      "Open Settings → Connectors → Add custom connector.",
      `Name it ${site.name} and paste the server URL below.`,
      "Click Connect and sign in. No key needed, it uses OAuth.",
    ],
    file: "server url",
    code: site.mcpUrl,
  },
  {
    id: "claude-code",
    name: "Claude Code",
    kind: "CLI",
    icon: "claude",
    needsKey: true,
    steps: ["Run this once in your terminal.", "Type /mcp inside Claude Code to check it's connected."],
    file: "terminal",
    code: `claude mcp add --transport http modelvend ${site.mcpUrl} \\
  --header "${bearer}"`,
  },
  {
    id: "chatgpt",
    name: "ChatGPT",
    kind: "App",
    icon: "openai",
    needsKey: false,
    steps: [
      "Settings → Apps & Connectors → Advanced, turn on Developer mode.",
      "Back in Apps & Connectors, click Create and paste the URL below.",
      "Pick OAuth as authentication and sign in.",
    ],
    file: "server url",
    code: site.mcpUrl,
  },
  {
    id: "codex",
    name: "Codex",
    kind: "CLI",
    icon: "openai",
    needsKey: true,
    steps: ["Add this block to your Codex config.", `Codex reads the key from ${apiKeyEnv}.`],
    file: "~/.codex/config.toml",
    code: `[mcp_servers.modelvend]
url = "${site.mcpUrl}"
bearer_token_env_var = "${apiKeyEnv}"`,
  },
  {
    id: "gemini",
    name: "Gemini",
    kind: "CLI",
    icon: "gemini",
    needsKey: true,
    steps: ["Add the server to your Gemini settings.", "Run /mcp in Gemini CLI to see the tools."],
    file: "~/.gemini/settings.json",
    code: `{
  "mcpServers": {
    "modelvend": {
      "httpUrl": "${site.mcpUrl}",
      "headers": { "Authorization": "Bearer $${apiKeyEnv}" }
    }
  }
}`,
  },
  {
    id: "cursor",
    name: "Cursor",
    kind: "Editor",
    icon: "cursor",
    needsKey: true,
    steps: ["Add this to your project or global MCP config.", "Enable it under Settings → MCP."],
    file: ".cursor/mcp.json",
    code: `{
  "mcpServers": {
    "modelvend": {
      "url": "${site.mcpUrl}",
      "headers": { "Authorization": "Bearer \${env:${apiKeyEnv}}" }
    }
  }
}`,
  },
];

export const mcpTools: { name: string; description: string }[] = [
  { name: "list_models", description: "Browse the model library and compare capabilities" },
  { name: "create_generation", description: "Start a video, image or audio job" },
  { name: "get_generation", description: "Check status and fetch the finished asset" },
];

export const mcpPrompts = [
  "Make an 8 second 16:9 clip of a paper boat in a neon canal with lumen-1",
  "Which video models support 4K and how much do they cost?",
  "Show my last five generations and their status",
];
