"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useConsole } from "@/providers/console-provider";
import type { Model } from "@/types/model";
import { examplesFor, mediaPool, type PlaygroundExample } from "../../lib/examples";
import {
  aspectRatio,
  estimateCost,
  initialValues,
  playgroundControls,
  playgroundModes,
  referenceSlot,
  summarize,
  withValues,
  type PlaygroundRun,
  type PlaygroundValues,
} from "../../lib/playground";
import { panelId, tabId } from "../detail/tabs";
import { PlaygroundForm, promptFieldId } from "./playground-form";
import { PlaygroundHistory } from "./playground-history";
import { PlaygroundStage, type StageView } from "./playground-stage";
import type { Reference } from "./reference-input";
import { useRunHistory } from "./use-run-history";
import { useSimulatedRender } from "./use-simulated-render";

/**
 * Inputs on the left; on the right, one example at a time until the first run, then the selected output with history underneath.
 * Stays mounted while other tabs are open so drafts and results survive tab switches.
 */
export function Playground({
  model,
  initialPrompt,
  hidden,
  focusRequest,
}: {
  model: Model;
  initialPrompt: string;
  hidden: boolean;
  /** Bumped by "Try this model" to move focus into the prompt. */
  focusRequest: number;
}) {
  const { balance, openDialog } = useConsole();
  const controls = useMemo(() => playgroundControls(model), [model]);
  const modes = useMemo(() => playgroundModes(model), [model]);
  const examples = useMemo(() => examplesFor(model), [model]);
  const [mode, setMode] = useState(modes[0]);
  const [values, setValues] = useState<PlaygroundValues>(() => initialValues(controls));
  const [prompt, setPrompt] = useState(initialPrompt);
  const [references, setReferences] = useState<Reference[]>([]);
  const [runs, setRuns] = useRunHistory(model.slug);
  const [selectedId, setSelectedId] = useState<number>();
  const [view, setView] = useState<StageView>();
  const [exampleIndex, setExampleIndex] = useState(0);
  const render = useSimulatedRender();
  const referencesRef = useRef(references);

  const slot = useMemo(() => referenceSlot(model, mode), [model, mode]);

  useEffect(() => {
    referencesRef.current = references;
  }, [references]);

  useEffect(
    () => () => {
      referencesRef.current.forEach((r) => URL.revokeObjectURL(r.url));
      // Render timers stop on unmount, so unfinished runs would never complete.
      setRuns((list) => list.filter((r) => r.status === "done"));
    },
    [setRuns],
  );

  useEffect(() => {
    if (focusRequest && !hidden) document.getElementById(promptFieldId)?.focus({ preventScroll: true });
  }, [focusRequest, hidden]);

  const cost = estimateCost(model, values, prompt, references.length);
  const canRun = slot?.required ? references.length > 0 : prompt.trim().length > 0;
  const selected = runs.find((r) => r.id === selectedId) ?? runs[0];
  const stageView = view ?? (runs.length ? "output" : "example");
  const example = useMemo(() => {
    const ex = examples[exampleIndex];
    if (!ex) return undefined;
    const applied = withValues(controls, initialValues(controls), ex.values);
    return { ...ex, seconds: Number(applied.duration) || ex.seconds, labels: summarize(controls, applied) };
  }, [examples, exampleIndex, controls]);

  const clearReferences = () => {
    references.forEach((r) => URL.revokeObjectURL(r.url));
    setReferences([]);
  };

  const update = (id: number, patch: Partial<PlaygroundRun>) => setRuns((list) => list.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const run = () => {
    if (!canRun || balance < cost.total) return;
    const id = Date.now();
    const fromExample = examples.find((e) => e.prompt === prompt.trim())?.image;
    const pool =
      model.modality === "audio" ? [] : [...new Set([fromExample, ...mediaPool(model.modality)].filter((s): s is string => !!s))];
    const count = model.modality === "image" ? Number(values.count) : 1;
    const start = fromExample ? 0 : Math.floor(Math.random() * pool.length);
    setRuns((list) => [
      {
        id,
        prompt: prompt.trim(),
        mode: modes.length > 1 ? mode : undefined,
        values,
        labels: summarize(controls, values),
        cost: cost.total,
        ratio: aspectRatio(model, values),
        media: pool.length ? Array.from({ length: count }, (_, i) => pool[(start + i) % pool.length]) : [],
        status: "rendering",
        progress: 0,
      },
      ...list,
    ]);
    setSelectedId(id);
    setView("output");
    render(
      (progress) => update(id, { progress }),
      () => update(id, { status: "done", progress: 100, seconds: (Date.now() - id) / 1000 }),
    );
  };

  const focusPrompt = () => document.getElementById(promptFieldId)?.focus();

  const reuse = (r: PlaygroundRun) => {
    setPrompt(r.prompt);
    setValues(withValues(controls, initialValues(controls), r.values));
    if (r.mode && modes.includes(r.mode)) setMode(r.mode);
    focusPrompt();
  };

  const applyExample = (ex: PlaygroundExample) => {
    setPrompt(ex.prompt);
    setValues((v) => withValues(controls, v, ex.values));
    const textMode = modes.find((m) => m.startsWith("Text"));
    if (textMode && textMode !== mode) {
      setMode(textMode);
      clearReferences();
    }
    focusPrompt();
  };

  const reset = () => {
    setMode(modes[0]);
    setValues(initialValues(controls));
    setPrompt("");
    clearReferences();
  };

  return (
    <section id={panelId("playground")} role="tabpanel" aria-labelledby={tabId("playground")} hidden={hidden}>
      <div className="grid gap-5 @4xl:grid-cols-[minmax(360px,440px)_minmax(0,1fr)] @4xl:items-start">
        <PlaygroundForm
          model={model}
          modes={modes}
          mode={mode}
          onMode={(m) => {
            setMode(m);
            clearReferences();
          }}
          prompt={prompt}
          onPrompt={setPrompt}
          slot={slot}
          references={references}
          onReferences={setReferences}
          controls={controls}
          values={values}
          onValue={(id, value) => setValues((v) => ({ ...v, [id]: value }))}
          cost={cost}
          balance={balance}
          canRun={canRun}
          onRun={run}
          onReset={reset}
          onAddFunds={() => openDialog("add-funds")}
        />
        <div className="min-w-0">
          <PlaygroundStage
            model={model}
            view={stageView}
            onView={setView}
            run={selected}
            example={example}
            exampleIndex={exampleIndex}
            exampleCount={examples.length}
            onExampleIndex={setExampleIndex}
            onUseExample={applyExample}
            onReuse={reuse}
          />
          {runs.length > 0 && (
            <PlaygroundHistory
              model={model}
              runs={runs}
              selectedId={selected?.id}
              onSelect={(id) => {
                setSelectedId(id);
                setView("output");
              }}
              onClear={() => {
                setRuns(() => []);
                setSelectedId(undefined);
                setView("example");
              }}
            />
          )}
        </div>
      </div>
    </section>
  );
}
