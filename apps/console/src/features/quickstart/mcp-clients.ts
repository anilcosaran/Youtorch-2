import { apiKeyEnv } from "@/components/code/snippets";
import { site } from "@/config/site";

export type McpClientId = "claude" | "claude-code" | "chatgpt" | "codex" | "gemini" | "cursor";
export type McpClientIcon = "claude" | "openai" | "gemini" | "cursor";

/**
 * The MCP server takes the same API key as the REST API, as a bearer token, for every client. Clients that can
 * only sign in with OAuth can't connect yet; `unavailable` says why and what to use instead.
 */
export type McpClient = {
  id: McpClientId;
  name: string;
  kind: "App" | "CLI" | "Editor";
  icon: McpClientIcon;
} & (
  | {
      steps: string[];
      /** Label shown in the code block header, usually the file or command. */
      file: string;
      code: string;
      unavailable?: never;
    }
  | { unavailable: string; steps?: never; file?: never; code?: never }
);

const bearer = `Authorization: Bearer $${apiKeyEnv}`;

export const mcpClients: McpClient[] = [
  {
    id: "claude",
    name: "Claude",
    kind: "App",
    icon: "claude",
    unavailable: `Custom connectors in the Claude app sign in with OAuth, which ${site.name} doesn't offer yet. Use Claude Code with an API key for now.`,
  },
  {
    id: "claude-code",
    name: "Claude Code",
    kind: "CLI",
    icon: "claude",
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
    unavailable: `ChatGPT connectors sign in with OAuth, which ${site.name} doesn't offer yet. Use Codex with an API key for now.`,
  },
  {
    id: "codex",
    name: "Codex",
    kind: "CLI",
    icon: "openai",
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

/** The tools the MCP server registers, in the order an assistant usually calls them. */
export const mcpTools: { name: string; description: string }[] = [
  { name: "search_models", description: "Find models by name, task or modality" },
  { name: "get_model", description: "A model's input schema, output schema and price" },
  { name: "create_task", description: "Run a model with input that matches its schema" },
  { name: "wait_for_task", description: "Wait up to 60 seconds for a task to finish" },
  { name: "get_task", description: "A task's status, progress and output" },
  { name: "list_tasks", description: "Recent tasks in this workspace, newest first" },
  { name: "cancel_task", description: "Stop a task that hasn't finished" },
];

export const mcpPrompts = [
  "Make a 5 second 16:9 clip of a paper boat in a neon canal with modelvend/lumen-1",
  "Which video models support 4K and how much do they cost?",
  "Show my last five tasks and their status",
];
