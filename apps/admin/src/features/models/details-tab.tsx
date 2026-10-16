"use client";

import { useState } from "react";
import { LoaderCircle } from "lucide-react";
import { DetailSection } from "@/components/shared/detail-section";
import { Field } from "@/components/shared/field";
import { TagInput } from "@/components/shared/tag-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { updateModel, VISIBILITIES, type Medium, type Model, type ModelUpdate, type Visibility } from "@/lib/api/models";
import { slugify } from "@/lib/catalog";
import { VISIBILITY_DESCRIPTIONS, VISIBILITY_LABELS } from "@/lib/labels";
import { usePermissions } from "@/lib/session";
import { cn } from "@/lib/utils";
import { useModelAction } from "./use-model-action";

const MEDIA: Medium[] = ["text", "image", "video", "audio", "3d"];

function MediaChoice({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: Medium[];
  onChange: (value: Medium[]) => void;
  disabled: boolean;
}) {
  return (
    <fieldset className="grid gap-1.5">
      <legend className="mb-1.5 text-sm font-medium">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {MEDIA.map((medium) => {
          const on = value.includes(medium);
          return (
            <button
              key={medium}
              type="button"
              disabled={disabled}
              aria-pressed={on}
              onClick={() => onChange(on ? value.filter((m) => m !== medium) : [...value, medium])}
              className={cn(
                "h-7 rounded-md border px-2.5 text-xs font-medium capitalize outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
                on ? "border-ring/60 bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {medium === "3d" ? "3D" : medium}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/** The catalog entry: what customers read about the model and who may see it. */
export function DetailsTab({ model }: { model: Model }) {
  const can = usePermissions();
  const run = useModelAction();
  const locked = !can.editCatalog;
  const initial = {
    name: model.name,
    description: model.description,
    tasks: model.tasks,
    tags: model.tags,
    license: model.license ?? "",
    inputs: model.inputs,
    outputs: model.outputs,
    visibility: model.visibility,
    featured: model.featured,
  };
  const [draft, setDraft] = useState(initial);
  const [saving, setSaving] = useState(false);
  const changed = JSON.stringify(draft) !== JSON.stringify(initial);
  const patch = (next: Partial<typeof draft>) => setDraft((d) => ({ ...d, ...next }));

  const save = async () => {
    setSaving(true);
    const body: ModelUpdate = { ...draft, name: draft.name.trim(), license: draft.license.trim() || null };
    // A saved model comes back with a new updatedAt, which remounts the form with its values.
    await run(() => updateModel(model.id, body), "Details saved", "Couldn't save the details");
    setSaving(false);
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <DetailSection title="Catalog entry" bodyClassName="grid gap-4">
        <Field id="details-name" label="Name">
          <Input id="details-name" value={draft.name} onChange={(e) => patch({ name: e.target.value })} disabled={locked} />
        </Field>
        <Field id="details-description" label="Description">
          <Textarea
            id="details-description"
            value={draft.description}
            onChange={(e) => patch({ description: e.target.value })}
            disabled={locked}
            className="min-h-24"
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="details-tasks" label="Tasks" hint="Filters in the catalog, e.g. text-to-video.">
            <TagInput id="details-tasks" value={draft.tasks} onChange={(tasks) => patch({ tasks })} normalize={slugify} disabled={locked} />
          </Field>
          <Field id="details-tags" label="Badges" hint="new, trending or original show on cards.">
            <TagInput id="details-tags" value={draft.tags} onChange={(tags) => patch({ tags })} normalize={slugify} disabled={locked} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <MediaChoice label="Takes" value={draft.inputs} onChange={(inputs) => patch({ inputs })} disabled={locked} />
          <MediaChoice label="Makes" value={draft.outputs} onChange={(outputs) => patch({ outputs })} disabled={locked} />
        </div>
        <Field id="details-license" label="License" hint="e.g. commercial, research only.">
          <Input id="details-license" value={draft.license} onChange={(e) => patch({ license: e.target.value })} disabled={locked} />
        </Field>
      </DetailSection>
      <div className="flex flex-col gap-4">
        <DetailSection title="Who sees it" bodyClassName="grid gap-4">
          <Field id="details-visibility" label="Visibility" hint={VISIBILITY_DESCRIPTIONS[draft.visibility]}>
            <Select
              value={draft.visibility}
              onValueChange={(value) => patch({ visibility: value as Visibility })}
              disabled={locked}
            >
              <SelectTrigger id="details-visibility" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VISIBILITIES.map((v) => (
                  <SelectItem key={v} value={v}>
                    {VISIBILITY_LABELS[v]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <label className="flex items-start justify-between gap-4 text-sm">
            <span>
              <span className="block font-medium">Featured</span>
              <span className="block text-xs text-muted-foreground">Shown in the console&apos;s showcase and at the top of the catalog.</span>
            </span>
            <Switch checked={draft.featured} onCheckedChange={(featured) => patch({ featured })} disabled={locked} />
          </label>
        </DetailSection>
        {!locked && (
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={!changed || saving} onClick={() => setDraft(initial)}>
              Discard
            </Button>
            <Button disabled={!changed || saving || !draft.name.trim()} onClick={() => void save()}>
              {saving && <LoaderCircle className="animate-spin" />}
              Save details
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
