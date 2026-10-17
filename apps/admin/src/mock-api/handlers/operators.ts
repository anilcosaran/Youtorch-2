import type { Permission, Role } from "@modelvend/admin-api/auth";
import type { PermissionCatalog } from "@modelvend/admin-api/operators";
import { MIN_PASSWORD, generatePassword } from "@/lib/passwords";
import { PERMISSIONS, samePermissions } from "@/lib/permissions";
import { audit, changes } from "../audit";
import { conflict, invalid, invalidState, notFound } from "../http";
import { actor, route, type Context, type RouteDef } from "../router";
import { ACCESS_PRESETS, PERMISSION_CATALOG, withRequired } from "../seed/operators";
import type { OperatorRecord, Store } from "../types";
import { clone } from "../util";
import { bool, has, oneOf, text, type Body } from "../validate";
import { operatorView } from "../views";

const ROLES: readonly Role[] = ["admin", "custom"];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A password from the store's generator, so runs stay reproducible. */
const newPassword = (store: Store) =>
  generatePassword(20, (bytes) => {
    for (let i = 0; i < bytes.length; i++) bytes[i] = store.random.int(0, 255);
    return bytes;
  });

function chosenPassword(body: Body): string | undefined {
  const value = body.password;
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || value.length < MIN_PASSWORD) {
    return invalid("password", `Use at least ${MIN_PASSWORD} characters, or leave it empty to have one made.`);
  }
  return value;
}

/** Role and permissions from the body, falling back to `current`; what each permission requires is added. */
function readAccess(body: Body, current?: Pick<OperatorRecord, "role" | "permissions">): { role: Role; permissions: Permission[] } {
  const role = oneOf(body, "role", ROLES, !current) ?? current?.role ?? "custom";
  if (role === "admin") return { role, permissions: [...PERMISSIONS] };
  let permissions: Permission[] | undefined;
  if (has(body, "permissions")) {
    const value = body.permissions;
    if (!Array.isArray(value)) return invalid("permissions", "Must be a list of permissions.");
    const unknown = value.find((p) => !(PERMISSIONS as readonly unknown[]).includes(p));
    if (unknown !== undefined) invalid("permissions", `Unknown permission: ${String(unknown)}.`);
    permissions = value as Permission[];
  } else if (current?.role === "custom") {
    permissions = current.permissions;
  }
  if (!permissions || permissions.length === 0) invalid("permissions", "Choose at least one permission.");
  return { role, permissions: withRequired(permissions ?? []) };
}

function findOperator(store: Store, id: string): OperatorRecord {
  return store.operators.find((o) => o.id === id) ?? notFound("operator");
}

function createOperator(ctx: Context) {
  const { store, body } = ctx;
  const email = text(body, "email", { max: 254, required: "Enter an email address." }).toLowerCase();
  if (!EMAIL.test(email)) invalid("email", "Enter a valid email address.");
  const name = text(body, "name", { max: 100, required: "Enter a name." });
  const password = chosenPassword(body);
  const access = readAccess(body);
  if (store.operators.some((o) => o.email === email)) {
    conflict("An operator with this email already exists.", { email: "An operator with this email already exists." });
  }
  const generated = password === undefined ? newPassword(store) : null;
  const operator: OperatorRecord = {
    id: store.random.id("op_", 8),
    email,
    name,
    ...access,
    createdAt: new Date().toISOString(),
    lastLoginAt: null,
    disabled: false,
    password: password ?? generated ?? "",
  };
  store.operators.push(operator);
  audit(ctx, "operator.create", "operator", operator.id, { email, role: operator.role, permissions: operator.permissions });
  return { operator: operatorView(operator), password: generated };
}

function updateOperator(ctx: Context) {
  const { store, body } = ctx;
  const me = actor(ctx);
  const target = findOperator(store, ctx.params.id);
  const before = operatorView(target);
  const name = text(body, "name", { max: 100 });
  if (name === "") invalid("name", "Enter a name.");
  const access = has(body, "role") || has(body, "permissions") ? readAccess(body, target) : null;
  const disabled = bool(body, "disabled");
  const accessChanges = access !== null && (access.role !== target.role || !samePermissions(access.permissions, before.permissions));

  if (target.id === me.id) {
    if (accessChanges) invalid(has(body, "role") && access?.role !== target.role ? "role" : "permissions", "You can't change your own access.");
    if (disabled === true) invalid("disabled", "You can't disable yourself.");
  }
  const losesAdmin = target.role === "admin" && ((access !== null && access.role !== "admin") || disabled === true);
  if (losesAdmin && !store.operators.some((o) => o.id !== target.id && o.role === "admin" && !o.disabled)) {
    invalidState("Keep at least one active admin.");
  }

  if (name !== undefined) target.name = name;
  if (access) Object.assign(target, access);
  if (disabled !== undefined) target.disabled = disabled;
  const after = operatorView(target);
  const changed = changes(before, after, ["name", "role", "permissions", "disabled"]);
  if (Object.keys(changed).length > 0) audit(ctx, "operator.update", "operator", target.id, changed);
  return after;
}

function resetPassword(ctx: Context) {
  const target = findOperator(ctx.store, ctx.params.id);
  const chosen = chosenPassword(ctx.body);
  const generated = chosen === undefined ? newPassword(ctx.store) : null;
  target.password = chosen ?? generated ?? "";
  audit(ctx, "operator.reset_password", "operator", target.id, { generated: generated !== null });
  return { password: generated };
}

export const operatorRoutes: RouteDef[] = [
  route("GET", "/permissions", "signed-in", (): PermissionCatalog => ({ permissions: clone(PERMISSION_CATALOG), presets: clone(ACCESS_PRESETS) })),
  route("GET", "/operators", "operators.manage", ({ store }) => store.operators.map(operatorView)),
  route("POST", "/operators", "operators.manage", createOperator),
  route("PATCH", "/operators/:id", "operators.manage", updateOperator),
  route("POST", "/operators/:id/reset-password", "operators.manage", resetPassword),
];
