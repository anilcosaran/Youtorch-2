import type { ReactNode } from "react";
import Link from "next/link";
import { CodeBlock } from "@/components/code/code-block";
import { snippetsFor, type Snippets } from "@/components/code/snippets";
import { authSnippets, installSnippets, webhookSnippets } from "../snippets";
import { Timeline, TimelineStep } from "./timeline";

const steps: { title: string; body: ReactNode; code: Snippets }[] = [
  { title: "Install", body: "Use the official SDK or call the REST API directly.", code: installSnippets },
  {
    title: "Authenticate",
    body: (
      <>
        Create a key on the{" "}
        <Link href="/api-keys?new=1" className="text-ember-300 underline-offset-2 hover:underline">
          API keys
        </Link>{" "}
        page and expose it as an environment variable.
      </>
    ),
    code: authSnippets,
  },
  {
    title: "Generate",
    body: "Every model takes the same request shape. Change the model string to switch providers.",
    code: snippetsFor(),
  },
  {
    title: "Listen for results",
    body: "Long renders finish asynchronously. Subscribe to a webhook instead of polling.",
    code: webhookSnippets,
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
