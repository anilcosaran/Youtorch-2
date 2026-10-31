"use client";

import { useState } from "react";
import { LoaderCircle, Pencil } from "lucide-react";
import { errorMessage } from "@modelvend/admin-api/client";
import { updateVersion, type JsonSchema, type Model, type ModelVersion } from "@modelvend/admin-api/models";
import { DetailSection } from "@/components/shared/detail-section";
import { FormError } from "@/components/shared/field";
import { JsonView } from "@/components/shared/json-view";
import { Segmented } from "@/components/shared/segmented";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { describeSchemaProblem, exampleInput, isEditable, parseSchema, schemaFields, schemaProblem } from "@/lib/catalog";
import { usePermissions } from "@/lib/session";
import { isStale, toastError } from "@/lib/notify";
import { useApplyModel, useRefreshModel } from "./use-model-action";
import { VersionBar } from "./version-picker";

/** API origin shown in the example call. */
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "https://api.modelvend.ai/v1";

function FieldTable({ schema }: { schema: JsonSchema }) {
  const fields = schemaFields(schema);
  if (fields.length === 0) return <p className="text-sm text-muted-foreground">No properties.</p>;
  return (
    <div className="scroll-thin overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-muted-foreground">
            <th className="pb-2 text-left font-medium">Field</th>
            <th className="pb-2 text-left font-medium">Type</th>
            <th className="pb-2 text-left font-medium">Allowed</th>
            <th className="pb-2 text-left font-medium">Description</th>
          </tr>
        </thead>
        <tbody className="[&_td]:border-t [&_td]:py-2 [&_td]:pr-4 [&_td]:align-top">
          {fields.map((field) => (
            <tr key={field.name}>
              <td className="font-mono text-xs whitespace-nowrap">
                {field.name}
                {field.required && <span className="ml-1 text-status-critical" title="Required">*</span>}
              </td>
              <td className="font-mono text-xs whitespace-nowrap text-muted-foreground">{field.type}</td>
              <td className="max-w-64 text-xs text-muted-foreground">{field.constraints.join(" · ") || "—"}</td>
              <td className="text-xs">{field.description ?? <span className="text-muted-foreground">—</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A stored schema that breaks the shape the catalog relies on, e.g. one saved before schemas were checked. */
function SchemaWarning({ schema, editable }: { schema: JsonSchema; editable: boolean }) {
  const problem = schemaProblem(schema);
  if (!problem) return null;
  return (
    <p role="alert" className="mb-3 rounded-lg bg-status-critical/10 px-3 py-2 text-xs text-status-critical">
      This schema isn&apos;t valid: {describeSchemaProblem(problem)} The table shows what can be read, and the version can&apos;t be
      published until it is fixed{editable ? " with Edit JSON" : " in a new version"}.
    </p>
  );
}

type Which = "inputSchema" | "outputSchema";

function SchemaEditor({
  model,
  version,
  which,
  onClose,
}: {
  model: Model;
  version: ModelVersion;
  which: Which;
  onClose: () => void;
}) {
  const apply = useApplyModel();
  const refresh = useRefreshModel();
  // What the text was loaded from: a change made elsewhere since then is refused rather than overwritten.
  const [revision] = useState(model.revision);
  const [text, setText] = useState(() => JSON.stringify(version[which], null, 2));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const parsed = parseSchema(text);
  // The same shape check the server makes, so a broken schema is caught before it is sent.
  const problem = "error" in parsed ? null : schemaProblem(parsed.schema);
  const unusable = "error" in parsed || problem !== null;

  const save = async () => {
    if ("error" in parsed || problem) return;
    setBusy(true);
    setError(null);
    try {
      apply(await updateVersion(model.id, version.id, revision, { [which]: parsed.schema }));
      onClose();
    } catch (err) {
      refresh(model.id);
      if (isStale(err)) {
        toastError(err, "Couldn't save the schema");
        onClose();
        return;
      }
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

/** A version's input and output contract; docs, playground forms and SDK types are generated from it. */
export function SchemaTab({ model, version, onPick }: { model: Model; version: ModelVersion; onPick: (id: string) => void }) {
  const can = usePermissions();
  const [view, setView] = useState<"fields" | "json">("fields");
  const [editing, setEditing] = useState<Which | null>(null);
  const editable = can.editCatalog && isEditable(version);
  const target = version.id === model.defaultVersion ? model.id : `${model.id}@${version.id}`;
  const body = JSON.stringify({ model: target, input: exampleInput(version.inputSchema) }, null, 2).replace(/\n/g, "\n  ");
  const example = `curl ${API_BASE}/tasks \\
  -H "Authorization: Bearer mv_…" \\
  -H "Content-Type: application/json" \\
  -d '${body}'`;

  const section = (which: Which, title: string) => (
    <DetailSection
      title={title}
      action={
        editable && (
          <Button variant="outline" size="xs" onClick={() => setEditing(which)}>
            <Pencil /> Edit JSON
          </Button>
        )
      }
    >
      <SchemaWarning schema={version[which]} editable={editable} />
      {view === "fields" ? <FieldTable schema={version[which]} /> : <JsonView value={version[which]} />}
    </DetailSection>
  );

  return (
    <div className="flex flex-col gap-4">
      <VersionBar model={model} version={version} onPick={onPick}>
        <Segmented
          label="Schema view"
          value={view}
          onChange={setView}
          options={[
            { value: "fields", label: "Fields" },
            { value: "json", label: "JSON Schema" },
          ]}
        />
      </VersionBar>
      {section("inputSchema", "Input")}
      {section("outputSchema", "Output")}
      <DetailSection title="Example call">
        <pre className="scroll-thin overflow-x-auto rounded-md border bg-muted/40 p-3 font-mono text-xs leading-relaxed">{example}</pre>
        <p className="mt-2 text-xs text-muted-foreground">
          Every task is queued and answers 202 with its ID, to poll or to follow with a webhook. <code className="font-mono">Prefer: wait=N</code>{" "}
          waits up to N seconds, at most 60, for it to finish. See the task log for real calls.
        </p>
      </DetailSection>
      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editing === "outputSchema" ? "Output" : "Input"} schema of {version.id}
            </DialogTitle>
            <DialogDescription>JSON Schema (2020-12). The gateway validates every task&apos;s input against the input schema.</DialogDescription>
          </DialogHeader>
          {editing && <SchemaEditor model={model} version={version} which={editing} onClose={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
