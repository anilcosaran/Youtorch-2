import type { ReactNode } from "react";
import Link from "next/link";
import { CodeBlock } from "@/components/code/code-block";
import { snippetsFor, type Snippets } from "@/components/code/snippets";
import { authSnippets, installSnippets, webhookSnippets } from "../snippets";

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
    <ol className="relative max-w-4xl space-y-10 before:absolute before:top-2 before:bottom-2 before:left-[13px] before:w-px before:bg-gradient-to-b before:from-ember-500/60 before:via-line-strong before:to-transparent">
      {steps.map((step, i) => (
        <li key={step.title} className="relative pl-12">
          <span className="absolute top-0 left-0 grid size-7 place-items-center rounded-full border border-line-strong bg-raised font-mono text-[13px] text-ember-300">
            {i + 1}
          </span>
          <h2 className="text-[17px] font-semibold tracking-tight">{step.title}</h2>
          <p className="mt-1 mb-3.5 text-[14.5px] text-muted">{step.body}</p>
          <CodeBlock snippets={step.code} title={step.title.toLowerCase()} />
        </li>
      ))}
    </ol>
  );
}
