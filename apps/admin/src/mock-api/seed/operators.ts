import type { Permission } from "@modelvend/admin-api/auth";
import type { AccessPreset, PermissionInfo } from "@modelvend/admin-api/operators";
import { PERMISSIONS } from "@/lib/permissions";
import type { OperatorRecord } from "../types";
import { DAY, HOUR, iso } from "../util";

/** Every seeded operator signs in with this password in development; a production build never takes it. */
export const MOCK_PASSWORD = "modelvend-dev";

/** The operator a development browser is signed in as until it signs out. */
export const DEFAULT_OPERATOR_ID = "op_anil";

/** Grouped by area, in display order. */
export const PERMISSION_CATALOG: PermissionInfo[] = [
  { id: "catalog.view", area: "Catalog", label: "View catalog", description: "See models, versions, routes and apps.", requires: [] },
  {
    id: "catalog.edit",
    area: "Catalog",
    label: "Edit catalog",
    description: "Create models, versions and apps; change drafts, routes and app releases.",
    requires: ["catalog.view"],
  },
  {
    id: "catalog.publish",
    area: "Catalog",
    label: "Publish",
    description: "Publish, deprecate and retire versions, set defaults, deploy app releases, pause models and apps, and widen visibility.",
    requires: ["catalog.edit"],
  },
  {
    id: "pricing.edit",
    area: "Catalog",
    label: "Set prices",
    description: "Change sell prices and promos.",
    requires: ["catalog.edit"],
  },
  {
    id: "pricing.below_cost",
    area: "Catalog",
    label: "Sell below cost",
    description: "Publish a price that loses money on every call.",
    requires: ["pricing.edit"],
  },
  { id: "providers.view", area: "Providers", label: "View providers", description: "See providers, their health, limits and spend.", requires: [] },
  {
    id: "providers.edit",
    area: "Providers",
    label: "Manage providers",
    description: "Add providers, change limits, pause them and set credentials.",
    requires: ["providers.view"],
  },
  { id: "customers.view", area: "Customers", label: "View customers", description: "See customers, usage, balances and ledgers.", requires: [] },
  {
    id: "customers.edit",
    area: "Customers",
    label: "Edit customers",
    description: "Change limits; suspend and resume workspaces.",
    requires: ["customers.view"],
  },
  {
    id: "customers.credits",
    area: "Customers",
    label: "Grant credits",
    description: "Add or take back credits and refund tasks.",
    requires: ["customers.view"],
  },
  { id: "keys.view", area: "API keys", label: "View API keys", description: "See customers' keys by prefix, with scopes and spend.", requires: [] },
  {
    id: "keys.revoke",
    area: "API keys",
    label: "Manage API keys",
    description: "Revoke keys and change their spend limits.",
    requires: ["keys.view"],
  },
  { id: "tasks.view", area: "Tasks", label: "View tasks", description: "See tasks with their inputs, outputs and attempts.", requires: [] },
  { id: "audit.view", area: "Audit log", label: "View audit log", description: "See every change operators made.", requires: [] },
  { id: "settings.manage", area: "Settings", label: "Manage settings", description: "Change platform limits, the minimum margin, fees and credit lifetimes.", requires: [] },
  { id: "announcements.manage", area: "Settings", label: "Manage announcements", description: "Post and remove site announcements.", requires: [] },
  {
    id: "operators.manage",
    area: "Operators",
    label: "Manage operators",
    description: "Add operators, change their access and reset their passwords.",
    requires: [],
  },
];

const CATALOG_MANAGER: Permission[] = [
  "catalog.view",
  "catalog.edit",
  "catalog.publish",
  "pricing.edit",
  "providers.view",
  "providers.edit",
  "tasks.view",
];
const SUPPORT: Permission[] = ["catalog.view", "customers.view", "customers.edit", "keys.view", "keys.revoke", "tasks.view"];
const FINANCE: Permission[] = ["providers.view", "customers.view", "customers.credits", "tasks.view", "audit.view"];
const READ_ONLY: Permission[] = ["catalog.view", "providers.view", "customers.view", "keys.view", "tasks.view", "audit.view"];

export const ACCESS_PRESETS: AccessPreset[] = [
  { id: "admin", label: "Admin", description: "Everything, including managing operators.", role: "admin", permissions: [...PERMISSIONS] },
  {
    id: "catalog-manager",
    label: "Catalog manager",
    description: "Runs the catalog and providers: versions, routes, apps and releases.",
    role: "custom",
    permissions: CATALOG_MANAGER,
  },
  {
    id: "support",
    label: "Support",
    description: "Helps customers: limits, suspensions and API keys.",
    role: "custom",
    permissions: SUPPORT,
  },
  {
    id: "finance",
    label: "Finance",
    description: "Credits, refunds and provider spend.",
    role: "custom",
    permissions: FINANCE,
  },
  { id: "read-only", label: "Read only", description: "Sees everything an operator can see; changes nothing.", role: "custom", permissions: READ_ONLY },
];

/** The permissions and everything they require, in catalog order. */
export function withRequired(permissions: readonly Permission[]): Permission[] {
  const found = new Set<Permission>();
  const visit = (permission: Permission) => {
    if (found.has(permission)) return;
    found.add(permission);
    for (const required of PERMISSION_CATALOG.find((info) => info.id === permission)?.requires ?? []) visit(required);
  };
  permissions.forEach(visit);
  return PERMISSIONS.filter((permission) => found.has(permission));
}

/** `password` is what every seeded operator signs in with (see `seedPassword` in session.ts). */
export function seedOperators(now: number, password: string): OperatorRecord[] {
  return [
    {
      id: DEFAULT_OPERATOR_ID,
      email: "anil@modelvend.ai",
      name: "Anıl Coşaran",
      role: "admin",
      permissions: [...PERMISSIONS],
      createdAt: iso(now - 420 * DAY),
      lastLoginAt: iso(now - 2 * HOUR),
      disabled: false,
      password,
      sessionVersion: 0,
    },
    {
      id: "op_mara",
      email: "mara@modelvend.ai",
      name: "Mara Lindqvist",
      role: "custom",
      permissions: CATALOG_MANAGER,
      createdAt: iso(now - 300 * DAY),
      lastLoginAt: iso(now - 5 * HOUR),
      disabled: false,
      password,
      sessionVersion: 0,
    },
    {
      id: "op_deniz",
      email: "deniz@modelvend.ai",
      name: "Deniz Aydın",
      role: "custom",
      permissions: SUPPORT,
      createdAt: iso(now - 190 * DAY),
      lastLoginAt: iso(now - 26 * HOUR),
      disabled: false,
      password,
      sessionVersion: 0,
    },
    {
      id: "op_jonas",
      email: "jonas@modelvend.ai",
      name: "Jonas Weber",
      role: "custom",
      permissions: READ_ONLY,
      createdAt: iso(now - 28 * DAY),
      lastLoginAt: iso(now - 12 * DAY),
      disabled: true,
      password,
      sessionVersion: 0,
    },
  ];
}
