"use client";

import { useState } from "react";
import { LoaderCircle } from "lucide-react";
import { updateModel, VISIBILITIES, type Medium, type Model, type ModelUpdate, type Visibility } from "@modelvend/admin-api/models";
import { DetailSection } from "@/components/shared/detail-section";
import { Field } from "@/components/shared/field";
import { TagInput } from "@/components/shared/tag-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useConfirm } from "@/components/shared/confirm";
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

type Details = ReturnType<typeof detailsOf>;

/** The editable part of a model, as the form holds it. */
const detailsOf = (model: Model) => ({
  name: model.name,
  description: model.description,
  tasks: model.tasks,
  tags: model.tags,
  license: model.license ?? "",
  inputs: model.inputs,
  outputs: model.outputs,
  visibility: model.visibility,
  featured: model.featured,
});

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** private < unlisted < public: moving right shows the model to more customers. */
const VISIBILITY_RANK: Record<Visibility, number> = { private: 0, unlisted: 1, public: 2 };

const WIDEN_TEXT: Record<Visibility, string> = {
  public: "It shows in the catalog, and every workspace can call its live versions.",
  unlisted: "Every workspace that knows its ID can call its live versions; it stays out of the catalog.",
  private: "",
};

/** The catalog entry: what customers read about the model and who may see it. */
export function DetailsTab({ model }: { model: Model }) {
  const can = usePermissions();
  const run = useModelAction();
  const confirm = useConfirm();
  const locked = !can.editCatalog;
  const current = detailsOf(model);
  // `origin` is what the edits started from. While nothing is edited the form follows the server; once something
  // is, a background refetch keeps the edits, and saving sends only the fields that were edited.
  const [seen, setSeen] = useState<Details>(current);
  const [origin, setOrigin] = useState<Details>(current);
  const [draft, setDraft] = useState<Details>(current);
  const [saving, setSaving] = useState(false);
  const dirty = !same(draft, origin);
  if (!same(seen, current)) {
    setSeen(current);
    if (!dirty) {
      setOrigin(current);
      setDraft(current);
    }
  }
  const changedElsewhere = dirty && !same(origin, current);
  const patch = (next: Partial<Details>) => setDraft((d) => ({ ...d, ...next }));
  const widens = VISIBILITY_RANK[draft.visibility] > VISIBILITY_RANK[model.visibility];

  const save = async () => {
    const edited = (Object.keys(draft) as (keyof Details)[]).filter((key) => !same(draft[key], origin[key]));
    if (edited.length === 0) return;
    if (draft.visibility !== origin.visibility && widens) {
      const ok = await confirm({
        title: `Make ${model.name} ${VISIBILITY_LABELS[draft.visibility].toLowerCase()}?`,
        description: `${WIDEN_TEXT[draft.visibility]} It is ${VISIBILITY_LABELS[model.visibility].toLowerCase()} now.`,
        action: `Make ${VISIBILITY_LABELS[draft.visibility].toLowerCase()}`,
      });
      if (!ok) return;
    }
    setSaving(true);
    const values = { ...draft, name: draft.name.trim(), license: draft.license.trim() || null };
    const body = Object.fromEntries(edited.map((key) => [key, values[key]])) as ModelUpdate;
    const saved = await run(() => updateModel(model.id, body), "Details saved", "Couldn't save the details");
    if (saved) {
      setOrigin(detailsOf(saved));
      setDraft(detailsOf(saved));
    }
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
          <Field
            id="details-visibility"
            label="Visibility"
            hint={
              can.publishCatalog
                ? VISIBILITY_DESCRIPTIONS[draft.visibility]
                : `${VISIBILITY_DESCRIPTIONS[draft.visibility]} Making it more visible needs the Publish permission.`
            }
          >
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
                  // Widening is a release decision: publishers only (the server refuses it too).
                  <SelectItem key={v} value={v} disabled={!can.publishCatalog && VISIBILITY_RANK[v] > VISIBILITY_RANK[model.visibility]}>
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
        {!locked && changedElsewhere && (
          <p role="status" className="rounded-lg bg-status-warning/10 px-3 py-2 text-xs">
            These details changed elsewhere while you were editing. Saving keeps the other changes and sends only the fields
            you edited; Discard shows the latest.
          </p>
        )}
        {!locked && (
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              disabled={!dirty || saving}
              onClick={() => {
                setOrigin(current);
                setDraft(current);
              }}
            >
              Discard
            </Button>
            <Button disabled={!dirty || saving || !draft.name.trim()} onClick={() => void save()}>
              {saving && <LoaderCircle className="animate-spin" />}
              Save details
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
