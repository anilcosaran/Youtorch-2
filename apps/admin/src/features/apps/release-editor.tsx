"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowDown, ArrowUp, LoaderCircle, Plus, Rocket, X } from "lucide-react";
import { toast } from "sonner";
import { updateRelease, type App, type AppRelease, type AppStep } from "@modelvend/admin-api/apps";
import { getModel, listModels } from "@modelvend/admin-api/models";
import { DetailSection } from "@/components/shared/detail-section";
import { Field } from "@/components/shared/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { margin } from "@/lib/catalog";
import { percent, unitPrice } from "@/lib/format";
import { toastError } from "@/lib/notify";
import { keys } from "@/lib/query-keys";

interface StepDraft {
  id: string;
  name: string;
  modelId: string;
  version: string;
  params: string;
}

const toDraft = (step: AppStep): StepDraft => ({ ...step, params: JSON.stringify(step.params, null, 2) });

function parseParams(text: string): Record<string, unknown> | null {
  if (!text.trim()) return {};
  try {
    const value: unknown = JSON.parse(text);
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

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

/** Edits the steps, price and notes of an app's draft release, and deploys it. */
export function ReleaseEditor({ app, release, onDeploy }: { app: App; release: AppRelease; onDeploy: () => void }) {
  const queryClient = useQueryClient();
  const models = useQuery({ queryKey: keys.modelOptions, queryFn: () => listModels({ limit: 200 }) });
  const [steps, setSteps] = useState<StepDraft[]>(release.steps.map(toDraft));
  const [price, setPrice] = useState(String(release.price));
  const [notes, setNotes] = useState(release.notes);
  const [saving, setSaving] = useState(false);

  const parsed = steps.map((s) => parseParams(s.params));
  const problems: string[] = [];
  if (steps.length === 0) problems.push("Add at least one step.");
  if (steps.some((s) => !s.name.trim() || !s.modelId || !s.version)) problems.push("Every step needs a name, a model and a version.");
  if (parsed.some((p) => p === null)) problems.push("Params are a JSON object.");
  if (!(Number(price) > 0)) problems.push("The price per run must be more than zero.");

  const body = () => ({
    steps: steps.map((s, i): AppStep => ({ id: s.id, name: s.name.trim(), modelId: s.modelId, version: s.version, params: parsed[i] ?? {} })),
    price: Number(price),
    notes: notes.trim(),
  });
  const changed =
    JSON.stringify(body()) !== JSON.stringify({ steps: release.steps, price: release.price, notes: release.notes });

  const patch = (index: number, next: Partial<StepDraft>) =>
    setSteps((list) => list.map((s, i) => (i === index ? { ...s, ...next } : s)));
  const move = (index: number, by: number) =>
    setSteps((list) => {
      const next = [...list];
      const [step] = next.splice(index, 1);
      next.splice(index + by, 0, step);
      return next;
    });

  const save = async () => {
    setSaving(true);
    try {
      const updated = await updateRelease(app.slug, release.number, body());
      queryClient.setQueryData(keys.app(app.slug), updated);
      void queryClient.invalidateQueries({ queryKey: keys.appList });
      toast.success(`Release #${release.number} saved`);
    } catch (error) {
      toastError(error, "Couldn't save the release");
    } finally {
      setSaving(false);
    }
  };

  const share = margin(Number(price), release.cost);

  return (
    <DetailSection
      title={`Draft release #${release.number}`}
      action={
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={!changed || problems.length > 0 || saving} onClick={() => void save()}>
            {saving && <LoaderCircle className="animate-spin" />}
            Save draft
          </Button>
          <Button size="sm" disabled={changed || problems.length > 0} onClick={onDeploy} title={changed ? "Save the draft first" : undefined}>
            <Rocket /> Deploy
          </Button>
        </div>
      }
      bodyClassName="grid gap-4"
    >
      <ol className="grid gap-3">
        {steps.map((step, i) => (
          <li key={step.id} className="grid gap-3 rounded-lg border p-3">
            <div className="flex items-center gap-2">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular">
                {i + 1}
              </span>
              <Input
                aria-label="Step name"
                value={step.name}
                placeholder="Remove background"
                onChange={(e) => patch(i, { name: e.target.value })}
                className="h-7"
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
            <div className="grid gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
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
            </div>
            <Field id={`params-${step.id}`} label="Fixed params" hint='JSON merged under the run input; {{input.image}} refers to what the user sent.'>
              <Textarea
                id={`params-${step.id}`}
                value={step.params}
                spellCheck={false}
                onChange={(e) => patch(i, { params: e.target.value })}
                aria-invalid={parsed[i] === null}
                className="min-h-16 font-mono text-xs md:text-xs"
              />
            </Field>
          </li>
        ))}
      </ol>
      <div>
        <Button
          variant="outline"
          size="xs"
          onClick={() =>
            setSteps((list) => [
              ...list,
              { id: `step-${Date.now().toString(36)}`, name: "", modelId: "", version: "", params: "{}" },
            ])
          }
        >
          <Plus /> Add step
        </Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-[12rem_minmax(0,1fr)]">
        <Field
          id="release-price"
          label="Price per run"
          hint={
            share === null
              ? `Upstream cost ${unitPrice(release.cost)} per run`
              : `Costs ${unitPrice(release.cost)} upstream · ${percent(share)} margin`
          }
        >
          <Input id="release-price" type="number" min={0} step="0.001" value={price} onChange={(e) => setPrice(e.target.value)} />
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
