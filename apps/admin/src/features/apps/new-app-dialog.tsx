"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { Field, FormError } from "@/components/shared/field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { APP_CATEGORIES, createApp, type AppCategory } from "@/lib/api/apps";
import { errorMessage, fieldErrors } from "@/lib/api/client";
import { keys } from "@/lib/api/keys";
import { ID_PART, slugify } from "@/lib/catalog";
import { APP_CATEGORY_LABELS } from "@/lib/labels";

function NewAppForm({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [tagline, setTagline] = useState("");
  const [category, setCategory] = useState<AppCategory>("image");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const shownSlug = slugTouched ? slug : slugify(name).replace(/\./g, "-");
  const slugError = shownSlug && !ID_PART.test(shownSlug) ? "Lowercase letters, digits, dots and dashes." : fields.slug;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const app = await createApp({ slug: shownSlug, name: name.trim(), tagline: tagline.trim(), category });
      queryClient.setQueryData(keys.app(app.slug), app);
      void queryClient.invalidateQueries({ queryKey: keys.appList });
      toast.success(`${app.name} created`, { description: "Add steps to release 1, then deploy it." });
      onDone();
      router.push(`/apps/${app.slug}`);
    } catch (err) {
      setFields(fieldErrors(err));
      setError(Object.keys(fieldErrors(err)).length ? null : errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-4">
      <FormError message={error} />
      <Field id="app-name" label="Name" error={fields.name}>
        <Input id="app-name" required autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Product shots" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="app-slug" label="Slug" hint={`Called as apps/${shownSlug || "slug"}`} error={slugError}>
          <Input
            id="app-slug"
            required
            value={shownSlug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value.toLowerCase().trim());
            }}
            className="font-mono"
          />
        </Field>
        <Field id="app-category" label="Category">
          <Select value={category} onValueChange={(value) => setCategory(value as AppCategory)}>
            <SelectTrigger id="app-category" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {APP_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {APP_CATEGORY_LABELS[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <Field id="app-tagline" label="Tagline" hint="One line for the app card.">
        <Input id="app-tagline" value={tagline} onChange={(e) => setTagline(e.target.value)} />
      </Field>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy || !name.trim() || !shownSlug || Boolean(slugError)}>
          {busy && <LoaderCircle className="animate-spin" />}
          Create app
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Creates an app with an empty draft release. */
export function NewAppDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New app</DialogTitle>
          <DialogDescription>It stays a draft, invisible to customers, until its first release is deployed.</DialogDescription>
        </DialogHeader>
        {open && <NewAppForm onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}
