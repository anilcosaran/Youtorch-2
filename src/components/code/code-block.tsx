"use client";

import { Fragment, useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { Segmented } from "@/components/ui/segmented";
import { cn } from "@/lib/cn";
import type { Lang } from "./snippets";

const langLabels: Record<Lang, string> = { curl: "cURL", python: "Python", node: "Node.js" };

const tokenPattern =
  /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|((?<![^\s])(?:#|\/\/).*$)|\b(from|import|const|await|new|print|console|curl)\b|(-[HdX]\b|\b\d+(?:\.\d+)?\b)|(\$[A-Z_]+)/gm;

function highlight(code: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const match of code.matchAll(tokenPattern)) {
    const index = match.index ?? 0;
    if (index > last) out.push(code.slice(last, index));
    const [text, str, comment, keyword, flag, env] = match;
    const cls = str
      ? "text-jade-400"
      : comment
        ? "text-subtle italic"
        : keyword
          ? "text-iris-300"
          : flag
            ? "text-ember-300"
            : env
              ? "text-ember-200"
              : "";
    out.push(
      <span key={index} className={cls}>
        {text}
      </span>,
    );
    last = index + text.length;
  }
  out.push(code.slice(last));
  return out;
}

export function CodeBlock({
  snippets,
  className,
  title = "Request",
}: {
  snippets: Record<Lang, string>;
  className?: string;
  title?: string;
}) {
  const [lang, setLang] = useState<Lang>("curl");
  const [copied, setCopied] = useState(false);
  const code = snippets[lang];
  const lines = code.split("\n");

  return (
    <div className={cn("overflow-hidden rounded-[var(--radius-card)] border border-line bg-canvas", className)}>
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
        <div className="flex items-center gap-2.5">
          <span className="flex gap-1">
            <span className="size-2 rounded-full bg-white/10" />
            <span className="size-2 rounded-full bg-white/10" />
            <span className="size-2 rounded-full bg-white/10" />
          </span>
          <span className="font-mono text-[12px] text-subtle">{title}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Segmented
            size="sm"
            value={lang}
            onChange={setLang}
            options={(Object.keys(langLabels) as Lang[]).map((l) => ({ value: l, label: langLabels[l] }))}
          />
          <button
            aria-label="Copy code"
            onClick={async () => {
              await navigator.clipboard.writeText(code);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="grid size-7 place-items-center rounded-md text-subtle transition hover:bg-white/5 hover:text-fg"
          >
            {copied ? <Check className="size-3.5 text-jade-400" /> : <Copy className="size-3.5" />}
          </button>
        </div>
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-[13.5px] leading-[1.7] text-fg/80">
        <code className="grid grid-cols-[auto_1fr] gap-x-4">
          {lines.map((line, i) => (
            <Fragment key={i}>
              <span className="text-right text-white/15 select-none">{i + 1}</span>
              <span className="whitespace-pre">{highlight(line)}</span>
            </Fragment>
          ))}
        </code>
      </pre>
    </div>
  );
}
