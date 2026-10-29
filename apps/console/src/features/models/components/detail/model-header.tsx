"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight, Code2, Copy, FileText, Flame, Play, Sparkles, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { site } from "@/config/site";
import { cn } from "@/lib/cn";
import { modelId } from "@/lib/model";
import type { Model } from "@/types/model";
import { ModelArt } from "../model-art";

export function ModelHeader({ model, onTry, onApi }: { model: Model; onTry: () => void; onApi: () => void }) {
  const toast = useToast();
  const [starred, setStarred] = useState(false);

  const id = modelId(model);
  // Open models credit their maker; white-label models never name it.
  const author =
    model.disclosure === "open" && model.author && !model.name.toLowerCase().startsWith(model.author.toLowerCase()) ? model.author : null;

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(id);
      toast(`Copied ${id}`);
    } catch {
      toast(`Couldn’t copy. The model ID is ${id}`);
    }
  };

  return (
    <header className="flex flex-wrap items-start justify-between gap-5">
      <div className="min-w-0">
        <h1 className="flex items-center gap-3 text-[24px] leading-8 font-semibold tracking-[-0.02em] text-fg">
          <ModelArt model={model} className="size-8 shrink-0 rounded-lg ring-1 ring-white/10" />
          <span className="min-w-0 truncate">
            {author && <span>{author}: </span>}
            {model.name}
          </span>
        </h1>
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[14px]">
          <span className="mr-1 text-muted">
            <Link href="/models" className="text-fg underline decoration-white/30 underline-offset-4 transition hover:decoration-white">
              {model.publisher}
            </Link>
            /{model.slug}
          </span>
          <IconButton label="Copy model ID" onClick={copyId}>
            <Copy />
          </IconButton>
          <IconButton label={starred ? "Remove from favorites" : "Add to favorites"} onClick={() => setStarred((s) => !s)}>
            <Star className={cn(starred && "fill-amber-chart text-amber-chart")} />
          </IconButton>
          <a
            href={site.docsUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-line px-2.5 text-[13px] text-fg transition hover:border-line-strong hover:bg-white/[0.04]"
          >
            <FileText className="size-3.5 text-muted" /> Model card <ArrowUpRight className="size-3 text-muted" />
          </a>
          {model.tags?.includes("original") && (
            <Badge tone="ember" className="ml-1 h-7 px-2">
              <Sparkles /> {site.name} original
            </Badge>
          )}
          {model.tags?.includes("trending") && (
            <Badge className="ml-1 h-7 px-2 text-fg">
              <Flame className="text-ember-400" /> Trending
            </Badge>
          )}
        </div>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" className="h-9 px-3.5 text-[14px]" onClick={onApi}>
          <Code2 /> API
        </Button>
        <Button variant="primary" className="h-9 px-3.5 text-[14px]" onClick={onTry}>
          <Play /> Try this model
        </Button>
      </div>
    </header>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="grid size-7 place-items-center rounded-md text-muted transition hover:bg-white/[0.06] hover:text-fg [&_svg]:size-3.5"
    >
      {children}
    </button>
  );
}
