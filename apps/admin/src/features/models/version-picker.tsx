"use client";

import type { Model, ModelVersion } from "@modelvend/admin-api/models";
import { VersionStatusPill } from "@/components/shared/status";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** Picks which version a tab shows; the default is marked. */
export function VersionPicker({
  model,
  version,
  onPick,
}: {
  model: Model;
  version: ModelVersion;
  onPick: (id: string) => void;
}) {
  return (
    <Select value={version.id} onValueChange={onPick}>
      <SelectTrigger aria-label="Version" className="min-w-56">
        <span className="text-muted-foreground">Version</span>
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper" align="start">
        {model.versionList.map((v) => (
          <SelectItem key={v.id} value={v.id}>
            <span className="font-mono">{v.id}</span>
            <span className="text-muted-foreground">{v.label}</span>
            {v.id === model.defaultVersion && <span className="text-xs text-muted-foreground">· default</span>}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** The bar above a version's routes, price or schema: the picker, its status and the tab's own actions. */
export function VersionBar({
  model,
  version,
  onPick,
  children,
}: {
  model: Model;
  version: ModelVersion;
  onPick: (id: string) => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <VersionPicker model={model} version={version} onPick={onPick} />
      <VersionStatusPill status={version.status} />
      {children && <div className="ml-auto flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}
