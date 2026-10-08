import Link from "next/link";
import { ArrowRight, BookOpen, Check, KeyRound } from "lucide-react";
import { CodeBlock } from "@/components/code/code-block";
import { snippetsFor } from "@/components/code/snippets";
import { buttonClass } from "@/components/ui/button";
import { site } from "@/config/site";
import { buildPoints } from "@/mocks/dashboard";

const glow = [
  "radial-gradient(45% 70% at 100% 100%, color-mix(in oklab, var(--color-ember-500) 14%, transparent), transparent 70%)",
  "radial-gradient(40% 60% at 70% 0%, color-mix(in oklab, var(--color-iris-500) 12%, transparent), transparent 70%)",
].join(", ");

export function BuildBanner() {
  return (
    <section className="relative isolate overflow-hidden surface">
      <div aria-hidden className="absolute inset-0 -z-10 dot-grid [mask-image:radial-gradient(60%_90%_at_0%_0%,#000,transparent)]" />
      <div aria-hidden className="absolute inset-0 -z-10" style={{ background: glow }} />
      <div className="grid items-center gap-8 p-6 sm:p-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-12 lg:p-10">
        <div>
          <p className="font-mono text-[12px] tracking-[0.18em] text-subtle uppercase">{site.name} API</p>
          <h2 className="mt-3 text-[clamp(28px,2.6vw,40px)] leading-[1.05] font-semibold tracking-[-0.03em] text-fg">
            One request.
            <br />
            <span className="text-muted">Every model in the library.</span>
          </h2>
          <p className="mt-3 max-w-md text-[15px] leading-relaxed text-muted">
            Swap the model name, keep the code. {site.name} routes, retries and bills every call on a single balance.
          </p>
          <ul className="mt-5 space-y-2">
            {buildPoints.map((p) => (
              <li key={p} className="flex items-center gap-2.5 text-[14px] text-fg/90">
                <span className="grid size-5 place-items-center rounded-full bg-ok/15 text-ok">
                  <Check className="size-3" />
                </span>
                {p}
              </li>
            ))}
          </ul>
          <div className="mt-7 flex flex-wrap gap-2">
            <Link href="/api-keys" className={buttonClass({ variant: "primary" })}>
              <KeyRound /> Create API key
            </Link>
            <Link href="/quickstart" className={buttonClass({ variant: "outline" })}>
              Quickstart <ArrowRight />
            </Link>
            <a href={site.docsUrl} target="_blank" rel="noreferrer" className={buttonClass({ variant: "ghost" })}>
              <BookOpen /> Docs
            </a>
          </div>
        </div>
        <CodeBlock snippets={snippetsFor()} title="POST /v1/video/generations" className="shadow-2xl shadow-black/40" />
      </div>
    </section>
  );
}
