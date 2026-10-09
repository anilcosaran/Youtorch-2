import Link from "next/link";
import { MessageSquareText, Wrench } from "lucide-react";
import { CodeBlock } from "@/components/code/code-block";
import { apiKeyEnv } from "@/components/code/snippets";
import type { McpClient } from "../mcp-clients";
import { mcpPrompts, mcpTools } from "../mcp-clients";
import { exportKey } from "../snippets";
import { Timeline, TimelineStep } from "./timeline";

const keyLink = (
  <Link href="/api-keys?new=1" className="text-ember-300 underline-offset-2 hover:underline">
    API key
  </Link>
);

export function McpSetup({ client }: { client: McpClient }) {
  return (
    <Timeline>
      <TimelineStep
        index={1}
        title="Connect"
        body={
          client.needsKey ? (
            <>
              Create an {keyLink}, export it, then add {client.name} using the snippet below.
            </>
          ) : (
            <>
              {client.name} signs in with OAuth. No {keyLink} needed — follow the steps and paste the server URL.
            </>
          )
        }
      >
        <ol className="mb-3.5 space-y-1.5">
          {client.steps.map((step, i) => (
            <li key={step} className="flex gap-2.5 text-[14px] text-fg/90">
              <span className="mt-px font-mono text-[12.5px] text-subtle">{i + 1}.</span>
              {step}
            </li>
          ))}
        </ol>
        {client.needsKey && (
          <CodeBlock code={exportKey} title={`export ${apiKeyEnv}`} className="mb-3" />
        )}
        <CodeBlock key={client.id} code={client.code} title={client.file} />
      </TimelineStep>

      <TimelineStep
        index={2}
        title="Just ask"
        body="Your assistant now sees the tools below and calls them for you. Talk to it in plain language."
      >
        <div className="grid gap-3 md:grid-cols-2">
          <div className="surface p-4">
            <p className="mb-2.5 flex items-center gap-2 text-[13px] font-medium text-subtle">
              <Wrench className="size-3.5" /> Tools
            </p>
            <ul className="space-y-2">
              {mcpTools.map((t) => (
                <li key={t.name} className="text-[14px]">
                  <code className="font-mono text-[13px] text-ember-200">{t.name}</code>
                  <span className="block text-muted">{t.description}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="surface p-4">
            <p className="mb-2.5 flex items-center gap-2 text-[13px] font-medium text-subtle">
              <MessageSquareText className="size-3.5" /> Try asking
            </p>
            <ul className="space-y-2">
              {mcpPrompts.map((p) => (
                <li key={p} className="rounded-lg border border-line bg-white/[0.02] px-3 py-2 text-[14px] text-fg/90">
                  “{p}”
                </li>
              ))}
            </ul>
          </div>
        </div>
      </TimelineStep>
    </Timeline>
  );
}
