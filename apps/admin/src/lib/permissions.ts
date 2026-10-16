import type { Operator, Permission, Role } from "./api/auth";
import type { AccessPreset, PermissionInfo } from "./api/operators";

/** Every permission, in the catalog's order. */
export const PERMISSIONS: readonly Permission[] = [
  "catalog.view",
  "catalog.edit",
  "catalog.publish",
  "providers.view",
  "providers.edit",
  "customers.view",
  "customers.edit",
  "customers.credits",
  "keys.view",
  "keys.revoke",
  "requests.view",
  "audit.view",
  "operators.manage",
];

/** The part of an operator that decides what they may do. */
export type Access = Pick<Operator, "role" | "permissions">;

/** Whether the operator holds the permission. Admins hold every one; nobody holds any before loading. */
export function can(access: Access | null | undefined, permission: Permission): boolean {
  if (!access) return false;
  return access.role === "admin" || access.permissions.includes(permission);
}

/** The names screens check, one per permission. */
const NAMED = {
  viewCatalog: "catalog.view",
  editCatalog: "catalog.edit",
  publishCatalog: "catalog.publish",
  viewProviders: "providers.view",
  manageProviders: "providers.edit",
  viewCustomers: "customers.view",
  editCustomers: "customers.edit",
  grantCredits: "customers.credits",
  viewKeys: "keys.view",
  revokeKeys: "keys.revoke",
  viewRequests: "requests.view",
  viewAudit: "audit.view",
  manageOperators: "operators.manage",
} as const satisfies Record<string, Permission>;

export type Permissions = Record<keyof typeof NAMED, boolean>;

export function permissionsFor(access: Access | null | undefined): Permissions {
  const entries = Object.entries(NAMED).map(([name, permission]) => [name, can(access, permission)]);
  return Object.fromEntries(entries) as Permissions;
}

/** Until the operator has loaded, nothing may be seen or changed. */
export const NO_PERMISSIONS: Permissions = permissionsFor(null);

/** The same permissions, whatever their order or repeats. */
export function samePermissions(a: readonly Permission[], b: readonly Permission[]): boolean {
  const left = new Set(a);
  const right = new Set(b);
  return left.size === right.size && [...left].every((p) => right.has(p));
}

/** The preset this access is: the admin one for an admin, else a custom preset with exactly these permissions. */
export function matchPreset(access: Access, presets: readonly AccessPreset[]): AccessPreset | null {
  if (access.role === "admin") return presets.find((p) => p.role === "admin") ?? null;
  return presets.find((p) => p.role === "custom" && samePermissions(p.permissions, access.permissions)) ?? null;
}

/** "Admin", a preset's name, or "Custom · 5 permissions". */
export function accessLabel(access: Access, presets: readonly AccessPreset[]): string {
  if (access.role === "admin") return "Admin";
  const preset = matchPreset(access, presets);
  if (preset) return preset.label;
  const count = new Set(access.permissions).size;
  return `Custom · ${count} ${count === 1 ? "permission" : "permissions"}`;
}

export interface PermissionArea {
  area: string;
  permissions: PermissionInfo[];
}

/** The catalog's permissions grouped by area, keeping its order. */
export function groupByArea(permissions: readonly PermissionInfo[]): PermissionArea[] {
  const areas: PermissionArea[] = [];
  for (const info of permissions) {
    const area = areas.find((a) => a.area === info.area);
    if (area) area.permissions.push(info);
    else areas.push({ area: info.area, permissions: [info] });
  }
  return areas;
}

/** `choice` is a preset's ID, or CUSTOM once a box was changed by hand. */
export const CUSTOM = "custom";

export interface AccessDraft {
  choice: string;
  role: Role;
  permissions: Permission[];
}

/** Every permission the catalog lists, in its order. */
const everything = (catalog: readonly PermissionInfo[]) => catalog.map((info) => info.id);

/** The editor's starting point for an operator's current access. */
export function draftFor(access: Access, presets: readonly AccessPreset[], catalog: readonly PermissionInfo[]): AccessDraft {
  const preset = matchPreset(access, presets);
  return {
    choice: preset?.id ?? (access.role === "admin" ? "admin" : CUSTOM),
    role: access.role,
    permissions: access.role === "admin" ? everything(catalog) : inOrder(access.permissions, catalog),
  };
}

/** Picking a preset ticks exactly its boxes; the admin preset ticks every one. */
export function choosePreset(preset: AccessPreset, catalog: readonly PermissionInfo[]): AccessDraft {
  return {
    choice: preset.id,
    role: preset.role,
    permissions: preset.role === "admin" ? everything(catalog) : inOrder(preset.permissions, catalog),
  };
}

/** Picking "Custom" keeps the boxes as they are and makes them editable. */
export function chooseCustom(draft: AccessDraft): AccessDraft {
  return { ...draft, choice: CUSTOM, role: "custom" };
}

/** A permission and everything it requires, however deep. */
function withRequired(permission: Permission, catalog: readonly PermissionInfo[]): Set<Permission> {
  const found = new Set<Permission>();
  const visit = (p: Permission) => {
    if (found.has(p)) return;
    found.add(p);
    for (const required of catalog.find((info) => info.id === p)?.requires ?? []) visit(required);
  };
  visit(permission);
  return found;
}

/**
 * Changing one box makes the access custom. Ticking a permission ticks what
 * it requires; unticking one unticks what requires it, as the server would.
 */
export function togglePermission(
  draft: AccessDraft,
  permission: Permission,
  on: boolean,
  catalog: readonly PermissionInfo[],
): AccessDraft {
  const permissions = on
    ? [...draft.permissions, ...withRequired(permission, catalog)]
    : draft.permissions.filter((p) => !withRequired(p, catalog).has(permission));
  return { choice: CUSTOM, role: "custom", permissions: inOrder(permissions, catalog) };
}

/** Custom access needs at least one permission. */
export function isComplete(draft: AccessDraft): boolean {
  return draft.role === "admin" || draft.permissions.length > 0;
}

/** Whether a draft would change the operator's access. */
export function changesAccess(draft: AccessDraft, access: Access): boolean {
  if (draft.role !== access.role) return true;
  return draft.role === "custom" && !samePermissions(draft.permissions, access.permissions);
}

/** What the API takes for a draft: admins carry no list. */
export function accessRequest(draft: AccessDraft): { role: Role; permissions?: Permission[] } {
  return draft.role === "admin" ? { role: "admin" } : { role: "custom", permissions: draft.permissions };
}

/** Permissions in the catalog's order, each once; ones the catalog doesn't list go last. */
function inOrder(permissions: readonly Permission[], catalog: readonly PermissionInfo[]): Permission[] {
  const wanted = new Set(permissions);
  const known = catalog.map((info) => info.id).filter((id) => wanted.has(id));
  const unknown = [...wanted].filter((id) => !known.includes(id));
  return [...known, ...unknown];
}
