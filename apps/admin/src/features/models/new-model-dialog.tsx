"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { errorMessage, fieldErrors } from "@modelvend/admin-api/client";
import { createModel, MODALITIES, VISIBILITIES, type Modality, type Visibility } from "@modelvend/admin-api/models";
import { Field, FormError } from "@/components/shared/field";
import { TagInput } from "@/components/shared/tag-input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ID_PART, modelHref, slugify } from "@/lib/catalog";
import { MODALITY_LABELS, VISIBILITY_DESCRIPTIONS, VISIBILITY_LABELS } from "@/lib/labels";
import { useApplyModel } from "./use-model-action";

/** Tasks offered while typing; anything else can be typed too. */
const TASK_HINTS: Record<Modality, string> = {
  image: "text-to-image, image-to-image, edit",
  video: "text-to-video, image-to-video, video-to-video",
  audio: "text-to-speech, text-to-music, speech-to-text",
  "3d": "image-to-3d, text-to-3d",
  text: "chat, completion",
};

function NewModelForm({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const apply = useApplyModel();
  const [name, setName] = useState("");
  const [publisher, setPublisher] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [modality, setModality] = useState<Modality>("image");
  const [tasks, setTasks] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("private");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  const shownSlug = slugTouched ? slug : slugify(name);
  const local: Record<string, string> = {};
  if (publisher && !ID_PART.test(publisher)) local.publisher = "Lowercase letters, digits, dots and dashes.";
  if (shownSlug && !ID_PART.test(shownSlug)) local.slug = "Lowercase letters, digits, dots and dashes.";
  const invalid = !name.trim() || !publisher || !shownSlug || Object.keys(local).length > 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (invalid) return;
    setBusy(true);
    setError(null);
    setFields({});
    try {
      const model = await createModel({
        publisher,
        slug: shownSlug,
        name: name.trim(),
        modality,
        tasks,
        description: description.trim(),
        visibility,
      });
      apply(model);
      toast.success(`${model.name} created`, { description: "Set up draft v1, then promote it to go live." });
      onDone();
      router.push(modelHref(model.id));
    } catch (err) {
      setFields(fieldErrors(err));
      setError(Object.keys(fieldErrors(err)).length ? null : errorMessage(err));
      setBusy(false);
    }
  };

  const error_ = (key: string) => local[key] ?? fields[key];

  return (
    <form onSubmit={submit} className="grid gap-4">
      <FormError message={error} />
      <Field id="model-name" label="Name" error={error_("name")}>
        <Input id="model-name" autoFocus required value={name} onChange={(e) => setName(e.target.value)} placeholder="Kling 3.0" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="model-publisher" label="Publisher" hint="Who made it, e.g. kling or google" error={error_("publisher")}>
          <Input
            id="model-publisher"
            required
            value={publisher}
            onChange={(e) => setPublisher(e.target.value.toLowerCase().trim())}
            aria-invalid={Boolean(error_("publisher"))}
            className="font-mono"
          />
        </Field>
        <Field id="model-slug" label="Slug" error={error_("slug")}>
          <Input
            id="model-slug"
            required
            value={shownSlug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value.toLowerCase().trim());
            }}
            aria-invalid={Boolean(error_("slug"))}
            className="font-mono"
          />
        </Field>
      </div>
      <p className="-mt-2 text-xs text-muted-foreground">
        Callers address it as{" "}
        <code className="rounded bg-muted px-1 py-0.5 font-mono">
          {publisher || "publisher"}/{shownSlug || "slug"}
        </code>
        . The ID can&apos;t change later.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="model-modality" label="Modality">
          <Select value={modality} onValueChange={(value) => setModality(value as Modality)}>
            <SelectTrigger id="model-modality" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MODALITIES.map((m) => (
                <SelectItem key={m} value={m}>
                  {MODALITY_LABELS[m]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field id="model-visibility" label="Visibility" hint={VISIBILITY_DESCRIPTIONS[visibility]}>
          <Select value={visibility} onValueChange={(value) => setVisibility(value as Visibility)}>
            <SelectTrigger id="model-visibility" className="w-full">
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
      </div>
      <Field id="model-tasks" label="Tasks" hint={`Press Enter after each, e.g. ${TASK_HINTS[modality]}`}>
        <TagInput id="model-tasks" value={tasks} onChange={setTasks} normalize={(text) => slugify(text)} />
      </Field>
      <Field id="model-description" label="Description" hint="One or two sentences for the catalog.">
        <Textarea id="model-description" value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-20" />
      </Field>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy || invalid}>
          {busy && <LoaderCircle className="animate-spin" />}
          Create model
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Adds a model to the catalog with an empty draft version. */
export function NewModelDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New model</DialogTitle>
          <DialogDescription>
            It starts with an empty draft version. Nobody can call it until a version with a route goes live.
          </DialogDescription>
        </DialogHeader>
        {/* Mounted only while open, so every visit starts empty. */}
        {open && <NewModelForm onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}
