"use client";

import { useEffect, useRef, useState, type DragEvent, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { AudioLines, ChevronRight, ImagePlus, Sparkles, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { PlaygroundHistory } from "@/features/models/components/playground/playground-history";
import { RenderProgress } from "@/features/models/components/playground/playground-output";
import { useRunHistory } from "@/features/models/components/playground/use-run-history";
import { useSimulatedRender } from "@/features/models/components/playground/use-simulated-render";
import type { PlaygroundRun } from "@/features/models/lib/playground";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/format";
import { useConsole } from "@/providers/console-provider";
import type { App } from "@/mocks/apps";
import { defaultValues, inputCopy, thumbnail } from "../lib/apps";
import { AppHero, type DropProps } from "./app-hero";
import { AppResult } from "./app-media";

interface Source {
  name: string;
  /** Image uploads only; audio is never previewed. */
  url?: string;
}

const card = "rounded-xl border border-line bg-canvas/50";

/** Start time doubles as the id, so render duration is `now - id`. */
const runId = () => Date.now();

/**
 * One job, one button. Until there's input the page is a showcase with a big upload target;
 * after that it becomes a compact workspace with the result beside the inputs.
 * Apps are black boxes: nothing here names the models that run them.
 */
export function AppStudio({ app }: { app: App }) {
  const copy = inputCopy(app);
  const toast = useToast();
  const { balance, openDialog } = useConsole();
  const [runs, setRuns] = useRunHistory(`app-${app.slug}`);
  const [selectedId, setSelectedId] = useState<number>();
  const [source, setSource] = useState<Source>();
  const [script, setScript] = useState("");
  const [writing, setWriting] = useState(false);
  const [values, setValues] = useState(() => defaultValues(app));
  const fileRef = useRef<HTMLInputElement>(null);
  const render = useSimulatedRender();

  useEffect(
    () => () => {
      // Render timers stop on unmount, so unfinished runs would never complete.
      setRuns((list) => list.filter((r) => r.status === "done"));
    },
    [setRuns],
  );

  // Every run of the app's live release costs the same, whatever the options.
  const cost = app.price;
  const ready = app.input === "text" ? script.trim().length > 0 : !!source;
  const blocked = balance < cost;
  const selected = runs.find((r) => r.id === selectedId) ?? runs[0];
  const started = writing || !!source || runs.length > 0;

  const pick = async (files: FileList | null) => {
    const file = [...(files ?? [])].find((f) => f.type.startsWith(`${app.input}/`));
    if (!file) return;
    if (app.input === "image") {
      try {
        setSource({ name: file.name, url: await thumbnail(file) });
      } catch {
        toast("That image couldn't be read");
      }
    } else setSource({ name: file.name });
  };

  const browse = () => (app.input === "text" ? setWriting(true) : fileRef.current?.click());

  const trySample = () => {
    const s = app.showcase;
    if (app.input === "text" && s.kind === "audio") {
      setScript(s.script);
      setWriting(true);
    } else if (app.input === "audio") setSource({ name: "sample-take.wav" });
    else if (s.kind === "compare") setSource({ name: "sample.jpg", url: s.before });
    else if (s.kind === "video") setSource({ name: "sample.jpg", url: s.image });
    else if (s.kind === "gallery") setSource({ name: "sample.jpg", url: s.images[0] });
  };

  const update = (id: number, patch: Partial<PlaygroundRun>) => setRuns((list) => list.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const run = (e: FormEvent) => {
    e.preventDefault();
    if (!ready || blocked) return;
    const s = app.showcase;
    const id = runId();
    const media =
      s.kind === "compare"
        ? [source?.url === s.before ? s.after : (source?.url ?? s.after)]
        : s.kind === "video"
          ? [source?.url ?? s.image]
          : s.kind === "gallery"
            ? Array.from({ length: app.results ?? 1 }, (_, i) => s.images[i % s.images.length])
            : [];
    setRuns((list) => [
      {
        id,
        prompt: app.input === "text" ? script.trim() : (source?.name ?? app.name),
        values,
        labels: Object.values(values),
        cost,
        ratio: 16 / 9,
        media,
        source: source?.url,
        status: "rendering",
        progress: 0,
      },
      ...list,
    ]);
    setSelectedId(id);
    render(
      (progress) => update(id, { progress }),
      () => update(id, { status: "done", progress: 100, seconds: (Date.now() - id) / 1000 }),
    );
  };

  const dropProps = (onDragging?: (on: boolean) => void): DropProps => ({
    onDragOver: (e: DragEvent) => {
      e.preventDefault();
      onDragging?.(true);
    },
    onDragLeave: () => onDragging?.(false),
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      onDragging?.(false);
      void pick(e.dataTransfer.files);
    },
  });

  return (
    <div className="@container mx-auto max-w-[1280px]">
      <input
        ref={fileRef}
        type="file"
        accept={copy.accept}
        hidden
        onChange={(e) => {
          void pick(e.target.files);
          e.target.value = "";
        }}
      />

      <nav aria-label="Breadcrumb" className="mb-6 flex items-center gap-1.5 text-[13.5px] text-muted">
        <Link href="/apps" className="transition hover:text-fg">
          Apps
        </Link>
        <ChevronRight className="size-3.5 text-subtle" />
        <span className="truncate text-fg">{app.name}</span>
      </nav>

      {!started ? (
        <AppHero app={app} copy={copy} onBrowse={browse} onSample={trySample} dropProps={dropProps} />
      ) : (
        <div className="grid gap-5 @4xl:grid-cols-[minmax(360px,440px)_minmax(0,1fr)] @4xl:items-start">
          <form onSubmit={run} className="flex flex-col gap-2 rounded-2xl border border-line bg-surface/60 p-2">
            <div className="px-2 pt-1.5 pb-1">
              <h1 className="text-[18px] font-semibold tracking-tight text-fg">{app.name}</h1>
              <p className="mt-0.5 text-[13px] text-muted">{app.tagline}</p>
            </div>

            {app.input === "text" ? (
              <label className={cn(card, "block p-3")}>
                <span className="text-[12.5px] font-medium text-muted">Script</span>
                <textarea
                  value={script}
                  onChange={(e) => setScript(e.target.value)}
                  rows={7}
                  maxLength={5000}
                  autoFocus
                  placeholder="Paste or write what the voice should say. Add [warm], [whispers] or [excited] to steer the delivery."
                  className="mt-1.5 w-full resize-none bg-transparent text-[14.5px] leading-relaxed text-fg outline-none placeholder:text-subtle"
                />
                <span className="block text-right text-[12px] text-subtle tabular">{script.length.toLocaleString()} / 5,000</span>
              </label>
            ) : source ? (
              <SourceCard
                source={source}
                onReplace={browse}
                onRemove={() => setSource(undefined)}
                drop={dropProps()}
                kind={app.input === "audio" ? "audio" : "image"}
              />
            ) : (
              <button
                type="button"
                onClick={browse}
                {...dropProps()}
                className="flex h-[150px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong bg-canvas/30 transition hover:border-white/25 hover:bg-white/[0.03]"
              >
                {app.input === "audio" ? <AudioLines className="size-5 text-fg/80" /> : <ImagePlus className="size-5 text-fg/80" />}
                <span className="text-[14px] font-medium text-fg">{copy.action}</span>
                <span className="text-[12.5px] text-muted">{copy.hint}</span>
              </button>
            )}

            <div className={cn(card, "space-y-3.5 p-3")}>
              {app.options.map((o) => (
                <OptionRow
                  key={o.id}
                  label={o.label}
                  options={o.options}
                  value={values[o.id]}
                  onChange={(v) => setValues((vs) => ({ ...vs, [o.id]: v }))}
                />
              ))}
            </div>

            {blocked ? (
              <button
                type="button"
                onClick={() => openDialog("add-funds")}
                className="flex h-12 items-center justify-center rounded-xl border border-line-strong text-[15px] font-semibold text-fg transition hover:bg-white/[0.06]"
              >
                Add credits to run
              </button>
            ) : (
              <button
                type="submit"
                disabled={!ready}
                title={ready ? undefined : app.input === "text" ? "Write a script first" : `${copy.action} first`}
                className="group flex h-12 items-center justify-center gap-2 rounded-xl bg-white text-[15px] font-semibold text-black transition hover:bg-white/90 active:translate-y-px disabled:cursor-not-allowed disabled:bg-white/[0.08] disabled:text-subtle"
              >
                <Sparkles className="size-4" /> Generate
                <span className="ml-1 rounded-md bg-black/[0.08] px-2 py-0.5 text-[13px] tabular group-disabled:bg-white/[0.06]">
                  {formatPrice(cost)}
                </span>
              </button>
            )}
            <p className="pb-1 text-center text-[12px] text-subtle">Fixed price per run · billed to your balance</p>
          </form>

          <div className="min-w-0">
            <div className="overflow-hidden rounded-2xl border border-line bg-surface/40">
              <div className="flex h-12 items-center gap-2 border-b border-line px-4">
                <span className="text-[14px] font-medium text-fg">Result</span>
                {selected?.status === "rendering" && <span className="size-1.5 animate-pulse rounded-full bg-fg" />}
                <span className="flex-1" />
                {selected?.status === "done" && (
                  <>
                    {selected.seconds !== undefined && (
                      <span className="mr-1 hidden text-[12.5px] text-subtle tabular sm:inline">
                        done in {selected.seconds.toFixed(1)}s
                      </span>
                    )}
                    {/* Runs are simulated until the console calls the API, so there is no file to download yet. */}
                    <span className="text-[12.5px] text-subtle">Sample output</span>
                  </>
                )}
              </div>
              <div className="relative h-[420px] dot-grid @4xl:h-[min(64vh,580px)]">
                {!selected ? (
                  <Empty>
                    {app.input === "text" ? "Write a script and press Generate." : `${copy.action}, pick your settings and press Generate.`}
                  </Empty>
                ) : selected.status === "rendering" ? (
                  <div className="absolute inset-0 grid place-items-center">
                    <RenderProgress value={selected.progress} />
                  </div>
                ) : (
                  <div
                    key={selected.id}
                    className="absolute inset-3 animate-fade-in overflow-hidden rounded-xl border border-line bg-canvas"
                  >
                    <AppResult app={app} run={selected} />
                  </div>
                )}
              </div>
            </div>
            {runs.length > 0 && (
              <PlaygroundHistory
                runs={runs}
                selectedId={selected?.id}
                onSelect={setSelectedId}
                onClear={() => {
                  setRuns(() => []);
                  setSelectedId(undefined);
                }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="absolute inset-0 grid place-items-center p-6 text-center">
      <div>
        <span className="mx-auto grid size-11 place-items-center rounded-full border border-line bg-canvas text-muted">
          <Sparkles className="size-4" />
        </span>
        <p className="mt-3 text-[14.5px] font-medium text-fg">Your result shows up here</p>
        <p className="mt-1 text-[13px] text-muted">{children}</p>
      </div>
    </div>
  );
}

function SourceCard({
  source,
  kind,
  onReplace,
  onRemove,
  drop,
}: {
  source: Source;
  kind: "image" | "audio";
  onReplace: () => void;
  onRemove: () => void;
  drop: DropProps;
}) {
  return (
    <div className={cn(card, "p-2")} {...drop}>
      {kind === "image" && source.url ? (
        <div className="relative aspect-[16/10] overflow-hidden rounded-lg bg-canvas">
          {/* eslint-disable-next-line @next/next/no-img-element -- upload preview or bundled sample */}
          <img src={source.url} alt={source.name} className="size-full object-cover" />
        </div>
      ) : (
        <div className="flex h-16 items-center gap-3 rounded-lg bg-white/[0.04] px-3">
          <AudioLines className="size-5 text-fg/80" />
          <span className="truncate text-[13.5px] text-fg">{source.name}</span>
        </div>
      )}
      <div className="mt-2 flex items-center gap-2 px-1">
        <span className="min-w-0 flex-1 truncate text-[12.5px] text-muted">{source.name}</span>
        <Button variant="ghost" size="sm" onClick={onReplace}>
          <Upload /> Replace
        </Button>
        <Button variant="ghost" size="sm" onClick={onRemove} aria-label="Remove file">
          <X />
        </Button>
      </div>
    </div>
  );
}

function OptionRow({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label}>
      <p className="mb-1.5 text-[12.5px] font-medium text-muted">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const active = o === value;
          return (
            <button
              key={o}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(o)}
              className={cn(
                "h-9 rounded-lg border px-3 text-[13.5px] font-medium transition",
                active ? "border-line-strong bg-white/[0.09] text-fg" : "border-line text-muted hover:border-line-strong hover:text-fg",
              )}
            >
              {o}
            </button>
          );
        })}
      </div>
    </div>
  );
}
