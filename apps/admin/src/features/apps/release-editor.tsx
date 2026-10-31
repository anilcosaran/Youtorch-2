"use client";

import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, LoaderCircle, Plus, Rocket, X } from "lucide-react";
import { toast } from "sonner";
import { updateRelease, type App, type AppRelease, type AppStep } from "@modelvend/admin-api/apps";
import { getModel, listModels } from "@modelvend/admin-api/models";
import { toDollars, toMicros } from "@modelvend/admin-api/money";
import { DetailSection } from "@/components/shared/detail-section";
import { Field } from "@/components/shared/field";
import { TagInput } from "@/components/shared/tag-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ID_PART, isDecimal, margin, parseJsonObject, parsePinned } from "@/lib/catalog";
import { percent, usdPrecise } from "@/lib/format";
import { toastError } from "@/lib/notify";
import { keys } from "@/lib/query-keys";
import { useSettings } from "@/lib/use-settings";
import { useApplyApp, useRefreshApp } from "./use-apply-app";

/** A step as the form holds it: the pinned model in its two selects, the input as typed. */
interface StepDraft {
  /** Tells rows apart on screen while the step's ID is being typed. */
  key: number;
  id: string;
  stage: string;
  modelId: string;
  version: string;
  input: string;
}

const NO_STAGE = "__none";

const toDraft = (step: AppStep, key: number): StepDraft => ({
  key,
  id: step.id,
  stage: step.stage ?? "",
  ...parsePinned(step.model),
  input: JSON.stringify(step.input, null, 2),
});

/** A step in the API's own field order, so a saved draft and an untouched form compare equal. */
const toStep = (step: AppStep): AppStep => ({ id: step.id, stage: step.stage, model: step.model, input: step.input });

/** The input as typed; an empty box is an empty object. */
const parseInput = (text: string) => (text.trim() ? parseJsonObject(text, "A step's input") : { value: {} });

/** Live versions of the model a step calls; apps pin one of them. */
function VersionSelect({ modelId, value, onChange }: { modelId: string; value: string; onChange: (version: string) => void }) {
  const model = useQuery({ queryKey: keys.model(modelId), queryFn: () => getModel(modelId), enabled: Boolean(modelId) });
  const live = model.data?.versionList.filter((v) => v.status === "live") ?? [];
  const pinnedGone = value && model.data && !live.some((v) => v.id === value);
  return (
    <Select value={value || undefined} onValueChange={onChange} disabled={!modelId || !model.data}>
      <SelectTrigger aria-label="Version" className="w-full" aria-invalid={Boolean(pinnedGone)}>
        <SelectValue placeholder={model.isFetching ? "Loading…" : "Version"} />
      </SelectTrigger>
      <SelectContent>
        {pinnedGone && (
          <SelectItem value={value} disabled>
            <span className="font-mono">{value}</span> <span className="text-destructive">not live</span>
          </SelectItem>
        )}
        {live.map((v) => (
          <SelectItem key={v.id} value={v.id}>
            <span className="font-mono">{v.id}</span> <span className="text-muted-foreground">{v.label}</span>
            {v.id === model.data?.defaultVersion && <span className="text-xs text-muted-foreground">· default</span>}
          </SelectItem>
        ))}
        {model.data && live.length === 0 && (
          <SelectItem value="__none" disabled>
            No live version
          </SelectItem>
        )}
      </SelectContent>
    </Select>
  );
}

/** Edits the steps, stages, output map, price and notes of an app's draft release, and deploys it. */
export function ReleaseEditor({ app, release, onDeploy }: { app: App; release: AppRelease; onDeploy?: () => void }) {
  const apply = useApplyApp();
  const refresh = useRefreshApp();
  const { minMargin } = useSettings();
  const models = useQuery({ queryKey: keys.modelOptions, queryFn: () => listModels({ limit: 200 }) });
  const [steps, setSteps] = useState<StepDraft[]>(() => release.steps.map(toDraft));
  const nextKey = useRef(release.steps.length);
  const [stages, setStages] = useState(release.stages);
  const [outputMap, setOutputMap] = useState(() => JSON.stringify(release.outputMap, null, 2));
  const [price, setPrice] = useState(() => String(toDollars(release.priceMicros)));
  const [notes, setNotes] = useState(release.notes);
  const [saving, setSaving] = useState(false);

  const parsed = steps.map((s) => parseInput(s.input));
  const parsedOutput = outputMap.trim() ? parseJsonObject(outputMap, "The output map") : { value: {} };
  const priceOk = isDecimal(price.trim()) && Number(price) > 0;
  const problems: string[] = [];
  if (steps.length === 0) problems.push("Add at least one step.");
  if (steps.some((s) => !ID_PART.test(s.id))) problems.push("A step's ID is lowercase letters, digits, dots and dashes.");
  if (new Set(steps.map((s) => s.id)).size !== steps.length) problems.push("Give each step its own ID.");
  if (steps.some((s) => !s.modelId || !s.version)) problems.push("Every step pins a model and a version.");
  if (steps.some((s) => s.stage && !stages.includes(s.stage))) problems.push("A step's stage must be one of the stages listed.");
  if (parsed.some((p) => "error" in p)) problems.push("A step's input is a JSON object.");
  if ("error" in parsedOutput) problems.push(parsedOutput.error);
  if (!priceOk) problems.push("The price per run is an amount above zero, in dollars.");

  const body = () => ({
    steps: steps.map(
      (s, i): AppStep => ({
        id: s.id,
        stage: s.stage || null,
        model: `${s.modelId}@${s.version}`,
        input: "value" in parsed[i] ? parsed[i].value : {},
      }),
    ),
    stages,
    outputMap: "value" in parsedOutput ? parsedOutput.value : {},
    priceMicros: priceOk ? toMicros(Number(price)) : 0,
    notes: notes.trim(),
  });
  const changed =
    JSON.stringify(body()) !==
    JSON.stringify({
      steps: release.steps.map(toStep),
      stages: release.stages,
      outputMap: release.outputMap,
      priceMicros: release.priceMicros,
      notes: release.notes,
    });

  const patch = (index: number, next: Partial<StepDraft>) =>
    setSteps((list) => list.map((s, i) => (i === index ? { ...s, ...next } : s)));
  const move = (index: number, by: number) =>
    setSteps((list) => {
      const next = [...list];
      const [step] = next.splice(index, 1);
      next.splice(index + by, 0, step);
      return next;
    });
  const addStep = () => {
    const key = nextKey.current++;
    setSteps((list) => {
      let number = list.length + 1;
      while (list.some((s) => s.id === `step-${number}`)) number++;
      return [...list, { key, id: `step-${number}`, stage: "", modelId: "", version: "", input: "{}" }];
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      apply(await updateRelease(app.slug, release.number, body()));
      toast.success(`Release #${release.number} saved`);
    } catch (error) {
      toastError(error, "Couldn't save the release");
      refresh(app.slug);
    } finally {
      setSaving(false);
    }
  };

  const share = priceOk ? margin(toMicros(Number(price)), release.costMicros) : null;
  const costText = `Costs ${usdPrecise(release.costMicros)} upstream`;

  return (
    <DetailSection
      title={`Draft release #${release.number}`}
      action={
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={!changed || problems.length > 0 || saving} onClick={() => void save()}>
            {saving && <LoaderCircle className="animate-spin" />}
            Save draft
          </Button>
          {onDeploy && (
            <Button size="sm" disabled={changed || problems.length > 0} onClick={onDeploy} title={changed ? "Save the draft first" : undefined}>
              <Rocket /> Deploy
            </Button>
          )}
        </div>
      }
      bodyClassName="grid gap-4"
    >
      <Field id="release-stages" label="Stages" hint="The public progress of a run, in order. Press Enter after each. Customers see these, never the steps.">
        <TagInput id="release-stages" value={stages} onChange={setStages} placeholder="Removing background" commas={false} />
      </Field>
      <ol className="grid gap-3">
        {steps.map((step, i) => {
          const input = parsed[i];
          return (
            <li key={step.key} className="grid gap-3 rounded-lg border p-3">
              <div className="flex items-center gap-2">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular">
                  {i + 1}
                </span>
                <Input
                  aria-label="Step ID"
                  value={step.id}
                  placeholder="remove-background"
                  onChange={(e) => patch(i, { id: e.target.value.toLowerCase().trim() })}
                  aria-invalid={!ID_PART.test(step.id)}
                  className="h-7 font-mono"
                />
                <Button variant="ghost" size="icon-sm" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                  <ArrowUp />
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label="Move down" disabled={i === steps.length - 1} onClick={() => move(i, 1)}>
                  <ArrowDown />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove step ${i + 1}`}
                  onClick={() => setSteps((list) => list.filter((_, j) => j !== i))}
                >
                  <X />
                </Button>
              </div>
              <div className="grid gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
                <Select value={step.modelId || undefined} onValueChange={(modelId) => patch(i, { modelId, version: "" })}>
                  <SelectTrigger aria-label="Model" className="w-full">
                    <SelectValue placeholder={models.isPending ? "Loading models…" : "Model"} />
                  </SelectTrigger>
                  <SelectContent>
                    {models.data?.items.map((m) => (
                      <SelectItem key={m.id} value={m.id} disabled={m.state === "paused" || !m.defaultVersion}>
                        {m.name} <span className="font-mono text-xs text-muted-foreground">{m.id}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <VersionSelect modelId={step.modelId} value={step.version} onChange={(version) => patch(i, { version })} />
                <Select value={step.stage || NO_STAGE} onValueChange={(stage) => patch(i, { stage: stage === NO_STAGE ? "" : stage })}>
                  <SelectTrigger aria-label="Stage" className="w-full" aria-invalid={Boolean(step.stage) && !stages.includes(step.stage)}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_STAGE}>No stage</SelectItem>
                    {step.stage && !stages.includes(step.stage) && (
                      <SelectItem value={step.stage} disabled>
                        {step.stage} <span className="text-destructive">not listed</span>
                      </SelectItem>
                    )}
                    {stages.map((stage) => (
                      <SelectItem key={stage} value={stage}>
                        {stage}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Field
                id={`input-${step.key}`}
                label="Input"
                hint="Exactly what the step sends, with {{input.x}} and {{steps.<id>.output.x}} of earlier steps filled in. Nothing is merged in."
              >
                <Textarea
                  id={`input-${step.key}`}
                  value={step.input}
                  spellCheck={false}
                  onChange={(e) => patch(i, { input: e.target.value })}
                  aria-invalid={"error" in input}
                  className="min-h-16 font-mono text-xs md:text-xs"
                />
              </Field>
            </li>
          );
        })}
      </ol>
      <div>
        <Button variant="outline" size="xs" onClick={addStep}>
          <Plus /> Add step
        </Button>
      </div>
      <Field
        id="release-output"
        label="Output map"
        hint="What the customer gets, as a JSON object built from templates such as {{steps.<id>.output.images}}."
        error={"error" in parsedOutput ? parsedOutput.error : undefined}
      >
        <Textarea
          id="release-output"
          value={outputMap}
          spellCheck={false}
          onChange={(e) => setOutputMap(e.target.value)}
          aria-invalid={"error" in parsedOutput}
          className="min-h-20 font-mono text-xs md:text-xs"
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-[12rem_minmax(0,1fr)]">
        <Field
          id="release-price"
          label="Price per run"
          hint={
            share === null
              ? `${costText}, per run at the steps' default tiers`
              : share < minMargin
                ? `${costText} · ${percent(share)} margin, under the ${percent(minMargin, 0)} minimum`
                : `${costText} · ${percent(share)} margin`
          }
        >
          <Input id="release-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} aria-invalid={!priceOk} />
        </Field>
        <Field id="release-notes" label="Release notes" hint="For operators; shown in the release history.">
          <Input id="release-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
      {problems.length > 0 && (
        <ul role="alert" className="list-inside list-disc text-xs text-destructive">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
    </DetailSection>
  );
}
