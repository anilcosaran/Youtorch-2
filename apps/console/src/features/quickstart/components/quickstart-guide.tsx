"use client";

import { type ComponentType, type ReactNode, type SVGProps, useState } from "react";
import { Code2 } from "lucide-react";
import { ClaudeIcon, CursorIcon, GeminiIcon, OpenAIIcon } from "@/components/brand/assistant-icons";
import { cn } from "@/lib/cn";
import { mcpClients, type McpClient, type McpClientIcon } from "../mcp-clients";
import { McpSetup } from "./mcp-setup";

type Path = "api" | McpClient["id"];

const icons: Record<McpClientIcon, ComponentType<SVGProps<SVGSVGElement>>> = {
  claude: ClaudeIcon,
  openai: OpenAIIcon,
  gemini: GeminiIcon,
  cursor: CursorIcon,
};

const tags: { id: Path; name: string; Icon: ComponentType<SVGProps<SVGSVGElement>> }[] = [
  { id: "api", name: "API", Icon: Code2 },
  ...mcpClients.map((c) => ({ id: c.id, name: c.name, Icon: icons[c.icon] })),
];

export function QuickstartGuide({ api }: { api: ReactNode }) {
  const [path, setPath] = useState<Path>("api");
  const client = mcpClients.find((c) => c.id === path);

  return (
    <>
      <div className="mb-8 max-w-4xl">
        <p className="mb-2.5 text-[14px] text-muted">Where do you want to start?</p>
        <div role="tablist" className="flex flex-wrap gap-1.5">
          {tags.map((tag) => {
            const active = tag.id === path;
            const Icon = tag.Icon;
            return (
              <button
                key={tag.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setPath(tag.id)}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-[13px] font-medium transition",
                  active
                    ? "border-ember-500/40 bg-ember-500/[0.1] text-fg"
                    : "border-line bg-white/[0.02] text-muted hover:border-line-strong hover:text-fg",
                )}
              >
                <Icon className="size-3.5 shrink-0" />
                {tag.name}
              </button>
            );
          })}
        </div>
      </div>
      {client ? <McpSetup client={client} /> : api}
    </>
  );
}
