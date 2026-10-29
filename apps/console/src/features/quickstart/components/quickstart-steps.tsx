import type { ReactNode } from "react";
import Link from "next/link";
import { CodeBlock } from "@/components/code/code-block";
import { snippetsFor, type Snippets } from "@/components/code/snippets";
import { authSnippets, installSnippets } from "../snippets";
import { Timeline, TimelineStep } from "./timeline";

const code = (text: string) => <code className="font-mono text-[13px] text-fg/90">{text}</code>;

const steps: { title: string; body: ReactNode; code: Snippets }[] = [
  {
    title: "Install",
    body: "Official SDKs are on the way. Until they ship, call the REST API with any HTTP client.",
    code: installSnippets,
  },
  {
    title: "Authenticate",
    body: (
      <>
        Create a key on the{" "}
        <Link href="/api-keys?new=1" className="text-ember-300 underline-offset-2 hover:underline">
          API keys
        </Link>{" "}
        page and expose it as an environment variable. Every request sends it as a bearer token.
      </>
    ),
    code: authSnippets,
  },
  {
    title: "Run a task",
    body: (
      <>
        Every model run is a task: {code("POST /v1/tasks")} with a model ID and an input that follows the model&apos;s schema. Short jobs
        can finish inside the request with {code("Prefer: wait=30")}; longer renders come back queued, so poll {code("GET /v1/tasks/{id}")}{" "}
        until the status is succeeded or failed. Webhooks are coming soon.
      </>
    ),
    code: snippetsFor(),
  },
];

export function QuickstartSteps() {
  return (
    <Timeline>
      {steps.map((step, i) => (
        <TimelineStep key={step.title} index={i + 1} title={step.title} body={step.body}>
          <CodeBlock snippets={step.code} title={step.title.toLowerCase()} />
        </TimelineStep>
      ))}
    </Timeline>
  );
}
