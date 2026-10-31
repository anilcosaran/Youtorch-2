"use client";

import { useState } from "react";
import { LoaderCircle, Pencil } from "lucide-react";
import { toast } from "sonner";
import { updateApp, type App } from "@modelvend/admin-api/apps";
import { errorMessage } from "@modelvend/admin-api/client";
import { DetailSection } from "@/components/shared/detail-section";
import { FormError } from "@/components/shared/field";
import { JsonView } from "@/components/shared/json-view";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { describeSchemaProblem, parseSchema, schemaProblem } from "@/lib/catalog";
import { usePermissions } from "@/lib/session";
import { useApplyApp, useRefreshApp } from "./use-apply-app";

type Which = "inputSchema" | "outputSchema";

const TITLES: Record<Which, string> = { inputSchema: "Input schema", outputSchema: "Output schema" };

function SchemaEditor({ app, which, onClose }: { app: App; which: Which; onClose: () => void }) {
  const apply = useApplyApp();
  const refresh = useRefreshApp();
  const [text, setText] = useState(() => JSON.stringify(app[which], null, 2));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const parsed = parseSchema(text);
  const problem = "error" in parsed ? null : schemaProblem(parsed.schema);
  const unusable = "error" in parsed || problem !== null;

  const save = async () => {
    if ("error" in parsed || problem) return;
    setBusy(true);
    setError(null);
    try {
      apply(await updateApp(app.slug, { [which]: parsed.schema }));
      toast.success(`${TITLES[which]} saved`);
      onClose();
    } catch (err) {
      refresh(app.slug);
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-3">
      <FormError message={error} />
      <Textarea
        aria-label="Schema JSON"
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
        className="h-[50vh] font-mono text-xs leading-relaxed md:text-xs"
      />
      {"error" in parsed && <p className="text-xs text-destructive">{parsed.error}</p>}
      {problem && <p className="text-xs text-destructive">{describeSchemaProblem(problem)}</p>}
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button disabled={busy || unusable} onClick={() => void save()}>
          {busy && <LoaderCircle className="animate-spin" />}
          Save schema
        </Button>
      </DialogFooter>
    </div>
  );
}

/** What a run of the app takes and gives back, whichever release is live. */
export function AppSchemas({ app }: { app: App }) {
  const can = usePermissions();
  const [editing, setEditing] = useState<Which | null>(null);

  const section = (which: Which) => (
    <DetailSection
      title={TITLES[which]}
      action={
        can.editCatalog && (
          <Button variant="outline" size="xs" onClick={() => setEditing(which)}>
            <Pencil /> Edit JSON
          </Button>
        )
      }
    >
      <JsonView value={app[which]} />
    </DetailSection>
  );

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {section("inputSchema")}
      {section("outputSchema")}
      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editing ? TITLES[editing] : "Schema"} of {app.name}
            </DialogTitle>
            <DialogDescription>
              JSON Schema (2020-12). {editing === "outputSchema" ? "What a run gives back." : "What a run takes; steps read it as {{input.x}}."}
            </DialogDescription>
          </DialogHeader>
          {editing && <SchemaEditor app={app} which={editing} onClose={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
