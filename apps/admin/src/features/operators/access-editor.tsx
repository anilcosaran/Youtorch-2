"use client";

import { ShieldCheck } from "lucide-react";
import type { PermissionCatalog } from "@modelvend/admin-api/operators";
import {
  chooseCustom,
  choosePreset,
  CUSTOM,
  groupByArea,
  togglePermission,
  type AccessDraft,
} from "@/lib/permissions";
import { cn } from "@/lib/utils";

const CUSTOM_PRESET = {
  id: CUSTOM,
  label: "Custom",
  description: "Tick the permissions one by one. Ticking one also ticks what it needs.",
};

/**
 * Who may do what: a preset, then the permissions it stands for. Picking a
 * preset ticks its boxes; changing a box makes the access custom. Admins
 * hold every permission, so their boxes can't be changed.
 */
export function AccessEditor({
  catalog,
  value,
  onChange,
  disabled = false,
  error,
}: {
  catalog: PermissionCatalog;
  value: AccessDraft;
  onChange: (draft: AccessDraft) => void;
  disabled?: boolean;
  /** A refusal of the role or the permissions. */
  error?: string;
}) {
  const admin = value.role === "admin";
  const presets = [...catalog.presets, CUSTOM_PRESET];
  const ticked = new Set(value.permissions);

  const pick = (id: string) => {
    if (id === CUSTOM) return onChange(chooseCustom(value));
    const preset = catalog.presets.find((p) => p.id === id);
    if (preset) onChange(choosePreset(preset, catalog.permissions));
  };

  return (
    <div className="grid gap-4">
      <fieldset disabled={disabled} className="grid gap-2">
        <legend className="mb-2 text-sm font-medium">Access</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {presets.map((preset) => {
            const selected = value.choice === preset.id;
            return (
              <label
                key={preset.id}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors has-focus-visible:ring-2 has-focus-visible:ring-ring has-disabled:cursor-default has-disabled:opacity-70",
                  selected ? "border-ring/60 bg-muted/50" : "hover:bg-muted/30",
                )}
              >
                <input
                  type="radio"
                  name="operator-access"
                  value={preset.id}
                  checked={selected}
                  onChange={() => pick(preset.id)}
                  className="mt-0.5 accent-[var(--brand)]"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{preset.label}</span>
                  <span className="block text-xs text-muted-foreground">{preset.description}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <fieldset disabled={disabled || admin} className="grid gap-3">
        <legend className="mb-2 text-sm font-medium">Permissions</legend>
        {admin ? (
          <p className="flex items-start gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            Admins can do everything, including managing operators.
          </p>
        ) : (
          ticked.size === 0 && (
            <p className="rounded-lg bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
              Tick at least one permission, or pick a preset.
            </p>
          )
        )}
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
        <div className={cn("grid gap-3", admin && "opacity-60")}>
          {groupByArea(catalog.permissions).map((group) => (
            <div key={group.area} role="group" aria-label={group.area} className="rounded-lg border">
              <p className="border-b bg-muted/30 px-3 py-1.5 text-xs font-medium text-muted-foreground">{group.area}</p>
              <ul className="divide-y">
                {group.permissions.map((info) => (
                  <li key={info.id}>
                    <label className="flex cursor-pointer items-start gap-3 px-3 py-2.5 has-disabled:cursor-default">
                      <input
                        type="checkbox"
                        checked={admin || ticked.has(info.id)}
                        onChange={(event) =>
                          onChange(togglePermission(value, info.id, event.target.checked, catalog.permissions))
                        }
                        className="mt-0.5 accent-[var(--brand)]"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm">{info.label}</span>
                        <span className="block text-xs text-muted-foreground">{info.description}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </fieldset>
    </div>
  );
}
